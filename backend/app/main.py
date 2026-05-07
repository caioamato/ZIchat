from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from .database import engine, Base, SessionLocal, get_db
from .models import models
from .auth import (
    verify_password, hash_password, create_token,
    get_current_user, require_admin,
)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ZItask API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATUS_MAP   = {s.value.upper(): s for s in models.TaskStatus}
_PRIORITY_MAP = {p.value.upper(): p for p in models.Priority}
_CATEGORY_MAP = {c.value.upper(): c for c in models.CategoryTag}


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
        new_categories = ["Administrativo", "Contabilidade", "Digital"]
        for val in new_categories:
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

        # Garante admin padrão
        exists = db.query(models.User).filter(
            models.User.role == models.UserRole.ADMIN_MASTER
        ).first()
        if not exists:
            admin = models.User(
                name="Administrador",
                email="admin@zitask.com",
                password_hash=hash_password("admin123"),
                role=models.UserRole.ADMIN_MASTER,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("✅ Admin padrão criado: admin@zitask.com / admin123")
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


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "To Do"
    priority: Optional[str] = "Medium"
    category: Optional[str] = "Geral"
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[list] = []
    assignees: Optional[list] = []
    project_id: Optional[int] = 1
    dod_checklist: Optional[list] = []
    attachments: Optional[list] = []
    blocking_dependencies: Optional[list] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[list] = None
    assignees: Optional[list] = None
    dod_checklist: Optional[list] = None
    attachments: Optional[list] = None
    blocking_dependencies: Optional[list] = None


# ── Auth endpoints ───────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/auth/login")
async def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.email == data.email.lower().strip()
    ).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo. Contate o administrador.")
    token = create_token(user.id, user.role.value)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
        },
    }


@app.get("/auth/me")
async def me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.value,
    }


@app.get("/members")
async def list_members(
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    members = db.query(models.User).filter(
        models.User.is_active == True
    ).order_by(models.User.name).all()
    return [{"id": u.id, "name": u.name, "email": u.email} for u in members]


# ── User management (admin only) ─────────────────────────────────────────────

@app.get("/users")
async def list_users(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
):
    users = db.query(models.User).order_by(models.User.created_at).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role.value,
            "is_active": u.is_active,
            "created_at": u.created_at,
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
    _user: models.User = Depends(get_current_user),
):
    return db.query(models.Task).all()


@app.get("/tasks/{task_id}")
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return task


@app.post("/tasks")
async def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
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
        category=_CATEGORY_MAP.get(task_data.category.upper(), models.CategoryTag.GENERAL),
        due_date=due,
        assigned_to=task_data.assigned_to,
        color=task_data.color,
        tags=task_data.tags,
        assignees=task_data.assignees or [],
        project_id=task_data.project_id,
        dod_checklist=task_data.dod_checklist,
        attachments=task_data.attachments,
        blocking_dependencies=task_data.blocking_dependencies,
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
    _user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if task_data.status is not None:
        task.status = _STATUS_MAP.get(task_data.status.upper(), task.status)
    if task_data.priority is not None:
        task.priority = _PRIORITY_MAP.get(task_data.priority.upper(), task.priority)
    if task_data.category is not None:
        task.category = _CATEGORY_MAP.get(task_data.category.upper(), task.category)
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

    db.commit()
    db.refresh(task)
    return task


@app.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    db.delete(task)
    db.commit()
    return {"message": "Tarefa deletada com sucesso"}
