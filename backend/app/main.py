from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from urllib.parse import urlparse
from datetime import datetime
import secrets, json, httpx, os, ssl
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from .database import engine, Base, SessionLocal, get_db
from .models import models
from .auth import (
    verify_password, hash_password, create_token,
    get_current_user, require_admin,
)

models.Base.metadata.create_all(bind=engine)

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="ZItask API", version="0.3.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

_STATUS_MAP   = {s.value.upper(): s for s in models.TaskStatus}
_PRIORITY_MAP = {p.value.upper(): p for p in models.Priority}


# ── Startup: garante que existe ao menos um admin ────────────────────────────

@app.on_event("startup")
def on_startup():
    import time
    for attempt in range(10):
        try:
            db = SessionLocal()
            db.execute(text("SELECT 1"))
            break
        except Exception:
            if attempt == 9:
                raise
            time.sleep(2)

    db = SessionLocal()
    try:
        # Adiciona novos valores ao enum categorytag se ainda não existirem
        # DDL do PostgreSQL não aceita parâmetros bind — usamos allowlist para validar antes de interpolar
        _CATEGORY_ALLOWLIST = {"Administrativo", "Contabilidade", "Digital"}
        for val in _CATEGORY_ALLOWLIST:
            try:
                db.execute(text(f"ALTER TYPE categorytag ADD VALUE IF NOT EXISTS '{val}'"))
                db.commit()
            except Exception:
                db.rollback()

        # Adiciona coluna assignees se não existir
        try:
            db.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignees JSONB DEFAULT '[]'::jsonb"))
            db.commit()
        except Exception:
            db.rollback()

        # Migra category de enum para varchar (permite categorias customizadas)
        try:
            db.execute(text("ALTER TABLE tasks ALTER COLUMN category DROP DEFAULT"))
            db.execute(text("ALTER TABLE tasks ALTER COLUMN category TYPE VARCHAR USING category::text"))
            db.execute(text("ALTER TABLE tasks ALTER COLUMN category SET DEFAULT 'Geral'"))
            db.commit()
        except Exception:
            db.rollback()

        # Adiciona coluna created_by se não existir
        try:
            db.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)"))
            db.commit()
        except Exception:
            db.rollback()

        # Adiciona coluna action_link se não existir
        try:
            db.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS action_link VARCHAR"))
            db.commit()
        except Exception:
            db.rollback()

        # Adiciona coluna systems se não existir
        try:
            db.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS systems JSONB DEFAULT '[]'::jsonb"))
            db.commit()
        except Exception:
            db.rollback()

        # Adiciona valor CONVIDADO ao enum userrole (uppercase, consistente com ADMIN_MASTER/COLABORADOR)
        try:
            # Corrige migração anterior que adicionou 'convidado' minúsculo
            db.execute(text("""
                UPDATE pg_enum SET enumlabel = 'CONVIDADO'
                WHERE enumtypid = 'userrole'::regtype AND enumlabel = 'convidado'
            """))
            db.commit()
        except Exception:
            db.rollback()
        try:
            db.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'CONVIDADO'"))
            db.commit()
        except Exception:
            db.rollback()

        # Adiciona valor GERENTE ao enum userrole
        try:
            db.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'GERENTE'"))
            db.commit()
        except Exception:
            db.rollback()

        # Cria tabela app_settings
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key VARCHAR PRIMARY KEY,
                    value TEXT
                )
            """))
            db.commit()
        except Exception:
            db.rollback()

        # Cria tabela groups e adiciona group_id em users
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS groups (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR NOT NULL UNIQUE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            db.commit()
        except Exception:
            db.rollback()
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL"))
            db.commit()
        except Exception:
            db.rollback()

        # Garante admin padrão
        exists = db.query(models.User).filter(
            models.User.role == models.UserRole.ADMIN_MASTER
        ).first()
        if not exists:
            _admin_pass = os.getenv("ADMIN_PASSWORD") or secrets.token_urlsafe(12)
            admin = models.User(
                name="Administrador",
                email="admin@zitask.com",
                password_hash=hash_password(_admin_pass),
                role=models.UserRole.ADMIN_MASTER,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"✅ Admin padrão criado: admin@zitask.com / {_admin_pass}")
            print("⚠️  Anote a senha acima e altere no primeiro acesso.")

        # Garante workspace e projeto padrão (necessário para FK de tasks)
        if not db.query(models.Workspace).first():
            ws = models.Workspace(name="Principal", description="Workspace padrão")
            db.add(ws)
            db.commit()
            db.refresh(ws)
            proj = models.Project(name="Geral", workspace_id=ws.id)
            db.add(proj)
            db.commit()
            print("✅ Workspace e projeto padrão criados")
    finally:
        db.close()


# ── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "colaborador"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class GroupCreate(BaseModel):
    name: str


class GroupRename(BaseModel):
    name: str


class GroupAddMember(BaseModel):
    user_id: int


def _validate_url(v: Optional[str]) -> Optional[str]:
    if not v or not v.strip():
        return None
    parsed = urlparse(v.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("action_link deve ser uma URL http ou https válida")
    return v.strip()


class TaskCreate(BaseModel):
    title: str = Field(..., max_length=500)
    description: Optional[str] = Field(None, max_length=10000)
    status: Optional[str] = "To Do"
    priority: Optional[str] = "Medium"
    category: Optional[str] = Field("Geral", max_length=100)
    due_date: Optional[str] = None
    assigned_to: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, max_length=20)
    tags: Optional[List[str]] = Field(default=[], max_length=50)
    assignees: Optional[List[dict]] = Field(default=[], max_length=50)
    project_id: Optional[int] = 1
    dod_checklist: Optional[List[dict]] = Field(default=[], max_length=100)
    attachments: Optional[List[dict]] = Field(default=[], max_length=20)
    blocking_dependencies: Optional[List] = Field(default=[], max_length=50)
    action_link: Optional[str] = Field(None, max_length=2000)
    systems: Optional[List] = Field(default=[], max_length=50)

    @field_validator("action_link", mode="before")
    @classmethod
    def validate_action_link(cls, v):
        return _validate_url(v)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=10000)
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    due_date: Optional[str] = None
    assigned_to: Optional[str] = Field(None, max_length=200)
    color: Optional[str] = Field(None, max_length=20)
    tags: Optional[List[str]] = Field(None, max_length=50)
    assignees: Optional[List[dict]] = Field(None, max_length=50)
    dod_checklist: Optional[List[dict]] = Field(None, max_length=100)
    attachments: Optional[List[dict]] = Field(None, max_length=20)
    blocking_dependencies: Optional[List] = Field(None, max_length=50)
    action_link: Optional[str] = Field(None, max_length=2000)
    systems: Optional[List] = Field(None, max_length=50)

    @field_validator("action_link", mode="before")
    @classmethod
    def validate_action_link(cls, v):
        return _validate_url(v)


# ── Auth endpoints ───────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.email == data.email.lower().strip()
    ).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo. Contate o administrador.")
    token = create_token(user.id, user.role.value)
    ws    = db.query(models.Workspace).first()
    group = db.query(models.Group).filter(models.Group.id == user.group_id).first() if user.group_id else None
    return {
        "token": token,
        "user": {
            "id":             user.id,
            "name":           user.name,
            "email":          user.email,
            "role":           user.role.value,
            "group_id":       user.group_id,
            "group_name":     group.name if group else None,
            "workspace_name": ws.name if ws else "ZItask",
        },
    }


@app.get("/auth/me")
async def me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.query(models.Workspace).first()
    group = db.query(models.Group).filter(models.Group.id == current_user.group_id).first() if current_user.group_id else None
    return {
        "id":             current_user.id,
        "name":           current_user.name,
        "email":          current_user.email,
        "role":           current_user.role.value,
        "group_id":       current_user.group_id,
        "group_name":     group.name if group else None,
        "workspace_name": ws.name if ws else "ZItask",
    }


@app.get("/members")
async def list_members(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    members = db.query(models.User).filter(
        models.User.is_active == True
    ).order_by(models.User.name).all()
    return [{"id": u.id, "name": u.name, "email": u.email, "group_id": u.group_id} for u in members]


# ── User management (admin only) ─────────────────────────────────────────────

@app.get("/users")
async def list_users(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    users = db.query(models.User).order_by(models.User.created_at).all()
    groups = {g.id: g.name for g in db.query(models.Group).all()}
    return [
        {
            "id":         u.id,
            "name":       u.name,
            "email":      u.email,
            "role":       u.role.value,
            "is_active":  u.is_active,
            "created_at": u.created_at,
            "group_id":   u.group_id,
            "group_name": groups.get(u.group_id),
        }
        for u in users
    ]


@app.post("/users", status_code=201)
async def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    email = data.email.lower().strip()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=409, detail="Já existe um usuário com este email")

    role_map = {r.value: r for r in models.UserRole}
    role = role_map.get(data.role.lower(), models.UserRole.COLABORADOR)

    user = models.User(
        name=data.name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role.value, "is_active": user.is_active, "created_at": user.created_at}


@app.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if data.name is not None:
        user.name = data.name.strip()
    if data.email is not None:
        email = data.email.lower().strip()
        conflict = db.query(models.User).filter(models.User.email == email, models.User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Email já em uso por outro usuário")
        user.email = email
    if data.role is not None:
        role_map = {r.value: r for r in models.UserRole}
        user.role = role_map.get(data.role.lower(), user.role)
    if data.is_active is not None:
        if user.id == admin.id and data.is_active is False:
            raise HTTPException(status_code=400, detail="Você não pode desativar sua própria conta")
        user.is_active = data.is_active
    if data.password is not None and data.password.strip():
        user.password_hash = hash_password(data.password)

    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role.value, "is_active": user.is_active, "created_at": user.created_at}


@app.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir sua própria conta")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    db.delete(user)
    db.commit()
    return {"message": "Usuário excluído com sucesso"}


# ── Groups (admin only) ──────────────────────────────────────────────────────

def _group_out(g: models.Group):
    return {
        "id":      g.id,
        "name":    g.name,
        "members": [{"id": u.id, "name": u.name, "email": u.email} for u in g.members],
    }


@app.get("/groups")
async def list_groups(db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    return [_group_out(g) for g in db.query(models.Group).order_by(models.Group.name).all()]


@app.post("/groups", status_code=201)
async def create_group(data: GroupCreate, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome não pode ser vazio")
    if db.query(models.Group).filter(models.Group.name == name).first():
        raise HTTPException(status_code=409, detail="Já existe um grupo com este nome")
    g = models.Group(name=name)
    db.add(g)
    db.commit()
    db.refresh(g)
    return _group_out(g)


@app.patch("/groups/{group_id}")
async def rename_group(group_id: int, data: GroupRename, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    g = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome não pode ser vazio")
    conflict = db.query(models.Group).filter(models.Group.name == name, models.Group.id != group_id).first()
    if conflict:
        raise HTTPException(status_code=409, detail="Já existe um grupo com este nome")
    g.name = name
    db.commit()
    db.refresh(g)
    return _group_out(g)


@app.delete("/groups/{group_id}")
async def delete_group(group_id: int, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    g = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    db.query(models.User).filter(models.User.group_id == group_id).update({"group_id": None})
    db.delete(g)
    db.commit()
    return {"message": "Grupo excluído"}


@app.post("/groups/{group_id}/members")
async def add_group_member(group_id: int, data: GroupAddMember, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    g = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    u = db.query(models.User).filter(models.User.id == data.user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    u.group_id = group_id
    db.commit()
    db.refresh(g)
    return _group_out(g)


@app.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(group_id: int, user_id: int, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    g = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    u = db.query(models.User).filter(models.User.id == user_id, models.User.group_id == group_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não está neste grupo")
    u.group_id = None
    db.commit()
    db.refresh(g)
    return _group_out(g)


@app.patch("/workspace")
async def rename_workspace(data: GroupRename, db: Session = Depends(get_db), _admin: models.User = Depends(require_admin)):
    ws = db.query(models.Workspace).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    ws.name = data.name.strip() or ws.name
    db.commit()
    return {"workspace_name": ws.name}


# ── User stats (admin only) ──────────────────────────────────────────────────

@app.get("/users/stats")
async def get_user_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in (models.UserRole.ADMIN_MASTER, models.UserRole.GERENTE):
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    if current_user.role == models.UserRole.GERENTE:
        users = db.query(models.User).filter(
            models.User.is_active == True,
            models.User.group_id == current_user.group_id
        ).all()
    else:
        users = db.query(models.User).filter(models.User.is_active == True).all()
    all_tasks = db.query(models.Task).all()
    now = datetime.utcnow()

    result = []
    for u in users:
        user_tasks = [
            t for t in all_tasks
            if t.created_by == u.id or any(
                a.get("id") == u.id for a in (t.assignees or []) if isinstance(a, dict)
            )
        ]
        done    = sum(1 for t in user_tasks if t.status and t.status.value == "Done")
        doing   = sum(1 for t in user_tasks if t.status and t.status.value in ("Doing", "Peer Review", "Testing"))
        overdue = sum(1 for t in user_tasks if t.due_date and t.due_date.replace(tzinfo=None) < now and (not t.status or t.status.value != "Done"))
        urgent  = sum(1 for t in user_tasks if t.priority and t.priority.value == "Urgent" and (not t.status or t.status.value != "Done"))
        result.append({
            "id":       u.id,
            "name":     u.name,
            "role":     u.role.value,
            "total":    len(user_tasks),
            "done":     done,
            "doing":    doing,
            "overdue":  overdue,
            "urgent":   urgent,
            "pct":      round((done / len(user_tasks)) * 100) if user_tasks else 0,
        })
    return result


# ── Seed ─────────────────────────────────────────────────────────────────────

@app.post("/seed")
async def seed_data(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    if db.query(models.Workspace).first():
        return {"message": "O banco já contém dados."}

    workspace = models.Workspace(name="Meu Workspace", description="Workspace principal")
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    project = models.Project(name="Projeto Principal", workspace_id=workspace.id)
    db.add(project)
    db.commit()
    db.refresh(project)

    tasks = [
        models.Task(task_id="ZI-001", title="Planejamento Q3", description="Definir metas e OKRs do trimestre",
                    status=models.TaskStatus.DONE, priority=models.Priority.HIGH,
                    category=models.CategoryTag.GENERAL, project_id=project.id, tags=["planejamento", "q3"]),
        models.Task(task_id="ZI-002", title="Campanha de Marketing", description="Criar materiais para campanha",
                    status=models.TaskStatus.DOING, priority=models.Priority.URGENT,
                    category=models.CategoryTag.MARKETING, project_id=project.id, assigned_to="Ana Silva", tags=["marketing"]),
        models.Task(task_id="ZI-003", title="Revisão de Contratos", description="Revisar contratos com fornecedores",
                    status=models.TaskStatus.TODO, priority=models.Priority.MEDIUM,
                    category=models.CategoryTag.FINANCE, project_id=project.id, tags=["contratos"]),
    ]
    db.add_all(tasks)
    db.commit()
    return {"message": "Dados semeados com sucesso!"}


# ── Tasks ────────────────────────────────────────────────────────────────────

@app.get("/tasks")
async def get_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role == models.UserRole.ADMIN_MASTER:
        return db.query(models.Task).all()

    # Gerente: vê todas as tarefas dos membros do seu grupo
    if current_user.role == models.UserRole.GERENTE and current_user.group_id:
        member_ids = {u.id for u in db.query(models.User).filter(
            models.User.group_id == current_user.group_id,
            models.User.is_active == True
        ).all()}
        return [
            t for t in db.query(models.Task).all()
            if t.created_by is None
            or t.created_by in member_ids
            or any(a.get("id") in member_ids for a in (t.assignees or []) if isinstance(a, dict))
        ]

    all_tasks = db.query(models.Task).all()
    visible = []
    for task in all_tasks:
        is_creator = task.created_by == current_user.id
        assignees = task.assignees or []
        is_assignee = any(a.get("id") == current_user.id for a in assignees if isinstance(a, dict))
        if is_creator or is_assignee:
            visible.append(task)
    return visible


@app.get("/tasks/{task_id}")
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if current_user.role != models.UserRole.ADMIN_MASTER:
        is_owner    = task.created_by == current_user.id
        is_assignee = any(a.get("id") == current_user.id for a in (task.assignees or []) if isinstance(a, dict))
        if not is_owner and not is_assignee:
            raise HTTPException(status_code=403, detail="Sem permissão para acessar esta atividade")
    return task


@app.post("/tasks")
async def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    last_task = db.query(models.Task).order_by(models.Task.id.desc()).first()
    next_id = 1
    if last_task and last_task.task_id.startswith("ZI-"):
        try:
            next_id = int(last_task.task_id.split("-")[1]) + 1
        except ValueError:
            pass

    due = None
    if task_data.due_date:
        try:
            due = datetime.fromisoformat(task_data.due_date)
        except ValueError:
            pass

    new_task = models.Task(
        task_id=f"ZI-{next_id:03d}",
        title=task_data.title,
        description=task_data.description,
        status=_STATUS_MAP.get(task_data.status.upper(), models.TaskStatus.TODO),
        priority=_PRIORITY_MAP.get(task_data.priority.upper(), models.Priority.MEDIUM),
        category=task_data.category or "Geral",
        due_date=due,
        assigned_to=task_data.assigned_to,
        color=task_data.color,
        tags=task_data.tags,
        assignees=task_data.assignees or [],
        created_by=current_user.id,
        project_id=task_data.project_id,
        dod_checklist=task_data.dod_checklist,
        attachments=task_data.attachments,
        blocking_dependencies=task_data.blocking_dependencies,
        action_link=task_data.action_link,
        systems=task_data.systems or [],
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task


@app.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if current_user.role != models.UserRole.ADMIN_MASTER:
        assignees = task.assignees or []
        is_assignee = any(a.get("id") == current_user.id for a in assignees if isinstance(a, dict))
        is_owner = task.created_by == current_user.id or task.created_by is None
        if not is_owner and not is_assignee:
            raise HTTPException(status_code=403, detail="Sem permissão para editar esta atividade")

    if task_data.status is not None:
        task.status = _STATUS_MAP.get(task_data.status.upper(), task.status)
    if task_data.priority is not None:
        task.priority = _PRIORITY_MAP.get(task_data.priority.upper(), task.priority)
    if task_data.category is not None:
        task.category = task_data.category
    if task_data.title is not None:
        task.title = task_data.title
    if task_data.description is not None:
        task.description = task_data.description
    if task_data.assigned_to is not None:
        task.assigned_to = task_data.assigned_to
    if task_data.color is not None:
        task.color = task_data.color
    if task_data.tags is not None:
        task.tags = task_data.tags
    if task_data.due_date is not None:
        if task_data.due_date == '':
            task.due_date = None
        else:
            try:
                task.due_date = datetime.fromisoformat(task_data.due_date)
            except ValueError:
                raise HTTPException(status_code=422, detail="Formato de data inválido. Use YYYY-MM-DD.")
    if task_data.dod_checklist is not None:
        task.dod_checklist = task_data.dod_checklist
    if task_data.attachments is not None:
        task.attachments = task_data.attachments
    if task_data.assignees is not None:
        task.assignees = task_data.assignees
    if task_data.blocking_dependencies is not None:
        task.blocking_dependencies = task_data.blocking_dependencies
    if task_data.action_link is not None:
        task.action_link = task_data.action_link if task_data.action_link.strip() else None
    if task_data.systems is not None:
        task.systems = task_data.systems

    db.commit()
    db.refresh(task)
    return task


@app.post("/auth/change-password")
async def change_password(
    data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    current_password = data.get("current_password", "")
    new_password     = data.get("new_password", "")
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Informe a senha atual e a nova senha")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter ao menos 6 caracteres")
    if not verify_password(current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    current_user.password_hash = hash_password(new_password)
    db.commit()
    return {"message": "Senha alterada com sucesso"}


# ── Reset de senha por email ─────────────────────────────────────────────────

async def _send_reset_email(to_email: str, to_name: str, new_password: str):
    smtp_host = os.getenv("SMTP_HOST", "smtp.hostinger.com")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "ZItask — Sua nova senha"
    msg["From"]    = f"ZItask <{smtp_from}>"
    msg["To"]      = to_email

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:16px;">
      <h2 style="color:#122B3C;margin-bottom:4px;">ZI<span style="color:#43B7BF">task</span></h2>
      <p style="color:#64748b;font-size:13px;margin-top:0;">Gestão de Atividades</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
      <p style="color:#1e293b;font-size:15px;">Olá, <strong>{to_name}</strong>!</p>
      <p style="color:#475569;font-size:14px;">Recebemos uma solicitação de redefinição de senha para sua conta.</p>
      <p style="color:#475569;font-size:14px;">Sua nova senha temporária é:</p>
      <div style="background:#122B3C;border-radius:10px;padding:16px 24px;text-align:center;margin:24px 0;">
        <span style="color:#43B7BF;font-size:22px;font-weight:900;letter-spacing:2px;font-family:monospace;">{new_password}</span>
      </div>
      <p style="color:#475569;font-size:13px;">Acesse o sistema e troque sua senha em <strong>Configurações → Alterar senha</strong>.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:32px;">Se você não solicitou isso, ignore este email. Sua senha anterior continua funcionando.</p>
    </div>
    """

    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    await aiosmtplib.send(
        msg,
        hostname=smtp_host,
        port=smtp_port,
        username=smtp_user,
        password=smtp_pass,
        tls_context=ctx,
        use_tls=True,
    )


@app.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, data: dict, db: Session = Depends(get_db)):
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Informe o email")

    user = db.query(models.User).filter(
        models.User.email == email,
        models.User.is_active == True,
    ).first()

    # Sempre retorna sucesso para não revelar se o email existe
    if not user:
        return {"message": "Se o email estiver cadastrado, você receberá a nova senha em instantes."}

    new_password = secrets.token_urlsafe(10)
    user.password_hash = hash_password(new_password)
    db.commit()

    try:
        await _send_reset_email(user.email, user.name, new_password)
    except Exception as e:
        # Reverte a senha se o email falhou
        db.refresh(user)
        raise HTTPException(status_code=502, detail=f"Erro ao enviar email: {str(e)}")

    return {"message": "Se o email estiver cadastrado, você receberá a nova senha em instantes."}


@app.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if current_user.role != models.UserRole.ADMIN_MASTER:
        is_owner = task.created_by == current_user.id or task.created_by is None
        if not is_owner:
            raise HTTPException(status_code=403, detail="Sem permissão para excluir esta atividade")

    db.delete(task)
    db.commit()
    return {"message": "Tarefa deletada com sucesso"}


# ── AI Settings ──────────────────────────────────────────────────────────────

class AIConfig(BaseModel):
    provider: str   # gemini | claude | openai
    api_key: str
    model: Optional[str] = None
    prompt: Optional[str] = None
    prompt_title: Optional[str] = None

class AIImproveRequest(BaseModel):
    text: str = Field(..., max_length=5000)
    mode: Optional[str] = Field("description", pattern="^(description|title)$")

def _get_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == key).first()
    return row.value if row else None

def _set_setting(db: Session, key: str, value: str):
    row = db.query(models.AppSetting).filter(models.AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(key=key, value=value))
    db.commit()


DEFAULT_AI_PROMPT = (
    "Você é AzorpaIA, assistente especializado em revisão de textos corporativos em português brasileiro. "
    "Revise e melhore o seguinte texto: corrija erros gramaticais, melhore a clareza e o estilo profissional, "
    "mantendo o significado original. Retorne APENAS o texto revisado, sem comentários adicionais.\n\nTexto:\n"
)
DEFAULT_AI_PROMPT_TITLE = (
    "Você é AzorpaIA. Melhore o título desta atividade: deixe claro, direto e profissional, em português brasileiro. "
    "Retorne APENAS o título revisado, sem explicações adicionais.\n\nTítulo:\n"
)

@app.get("/settings/ai")
async def get_ai_settings(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    raw = _get_setting(db, "ai_config")
    if not raw:
        return {"provider": None, "model": None, "has_key": False, "prompt": DEFAULT_AI_PROMPT, "prompt_title": DEFAULT_AI_PROMPT_TITLE}
    cfg = json.loads(raw)
    return {
        "provider":     cfg.get("provider"),
        "model":        cfg.get("model"),
        "has_key":      bool(cfg.get("api_key")),
        "prompt":       cfg.get("prompt") or DEFAULT_AI_PROMPT,
        "prompt_title": cfg.get("prompt_title") or DEFAULT_AI_PROMPT_TITLE,
    }


@app.post("/settings/ai")
async def save_ai_settings(
    data: AIConfig,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    _set_setting(db, "ai_config", json.dumps({
        "provider":     data.provider,
        "api_key":      data.api_key,
        "model":        data.model,
        "prompt":       data.prompt or DEFAULT_AI_PROMPT,
        "prompt_title": data.prompt_title or DEFAULT_AI_PROMPT_TITLE,
    }))
    return {"message": "Configuração salva com sucesso"}


@app.post("/ai/improve")
async def improve_text(
    data: AIImproveRequest,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    raw = _get_setting(db, "ai_config")
    if not raw:
        raise HTTPException(status_code=400, detail="IA não configurada. Solicite ao administrador.")
    cfg = json.loads(raw)
    provider = cfg.get("provider")
    api_key  = cfg.get("api_key")
    model    = cfg.get("model")
    user_text = data.text.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Texto vazio.")

    if data.mode == "title":
        system_prompt = cfg.get("prompt_title") or DEFAULT_AI_PROMPT_TITLE
    else:
        system_prompt = cfg.get("prompt") or DEFAULT_AI_PROMPT

    # Allowlists de modelos por provider — evita SSRF/injeção via model name
    _GEMINI_MODELS  = {"gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"}
    _CLAUDE_MODELS  = {"claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"}
    _OPENAI_MODELS  = {"gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"}

    try:
        if provider == "gemini":
            mdl = model if model in _GEMINI_MODELS else "gemini-2.5-flash"
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1/models/{mdl}:generateContent?key={api_key}",
                    json={
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": [{"parts": [{"text": user_text}]}],
                    }
                )
                resp.raise_for_status()
                result = resp.json()
                improved = result["candidates"][0]["content"]["parts"][0]["text"]

        elif provider == "claude":
            mdl = model if model in _CLAUDE_MODELS else "claude-haiku-4-5-20251001"
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": mdl, "max_tokens": 1024, "system": system_prompt,
                          "messages": [{"role": "user", "content": user_text}]}
                )
                resp.raise_for_status()
                improved = resp.json()["content"][0]["text"]

        elif provider == "openai":
            mdl = model if model in _OPENAI_MODELS else "gpt-4o-mini"
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": mdl, "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                    ]}
                )
                resp.raise_for_status()
                improved = resp.json()["choices"][0]["message"]["content"]

        else:
            raise HTTPException(status_code=400, detail="Provedor de IA inválido.")

        return {"improved": improved.strip()}

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Erro na API de IA ({e.response.status_code}): {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao contatar IA: {str(e)}")
