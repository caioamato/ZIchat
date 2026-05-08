from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum, DateTime, JSON, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from ..database import Base


class UserRole(str, enum.Enum):
    ADMIN_MASTER = "admin_master"
    COLABORADOR = "colaborador"
    CONVIDADO = "convidado"
    GERENTE = "gerente"


class Group(Base):
    __tablename__ = "groups"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    members = relationship("User", back_populates="group", foreign_keys="User.group_id")


class User(Base):
    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String, nullable=False)
    email        = Column(String, unique=True, index=True, nullable=False)
    password_hash= Column(String, nullable=False)
    role         = Column(Enum(UserRole), default=UserRole.COLABORADOR, nullable=False)
    is_active    = Column(Boolean, default=True, nullable=False)
    group_id     = Column(Integer, ForeignKey("groups.id"), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    group = relationship("Group", back_populates="members", foreign_keys=[group_id])


class TaskStatus(str, enum.Enum):
    BACKLOG = "Backlog"
    TODO = "To Do"
    DOING = "Doing"
    REVIEW = "Peer Review"
    TESTING = "Testing"
    DEPLOY = "Deploy"
    DONE = "Done"


class Priority(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    URGENT = "Urgent"


class CategoryTag(str, enum.Enum):
    GENERAL = "Geral"
    MARKETING = "Marketing"
    DESIGN = "Design"
    DEVELOPMENT = "Desenvolvimento"
    FINANCE = "Financeiro"
    HR = "RH"
    OPERATIONS = "Operações"
    ADMINISTRATIVE = "Administrativo"
    ACCOUNTING = "Contabilidade"
    DIGITAL = "Digital"
    OTHER = "Outro"


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(Text, nullable=True)

    projects = relationship("Project", back_populates="workspace")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"))

    workspace = relationship("Workspace", back_populates="projects")
    tasks = relationship("Task", back_populates="project")
    sprints = relationship("Sprint", back_populates="project")


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    start_date = Column(DateTime(timezone=True))
    end_date = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    project_id = Column(Integer, ForeignKey("projects.id"))

    project = relationship("Project", back_populates="sprints")
    tasks = relationship("Task", back_populates="sprint")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String, unique=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.TODO)
    priority = Column(Enum(Priority), default=Priority.MEDIUM, nullable=True)
    category = Column(String, default="Geral", nullable=True)

    due_date = Column(DateTime(timezone=True), nullable=True)
    assigned_to = Column(String, nullable=True)
    color = Column(String, nullable=True)
    tags = Column(JSON, nullable=True)

    assignees   = Column(JSON, nullable=True)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_link = Column(String, nullable=True)

    dod_checklist = Column(JSON, nullable=True)
    attachments = Column(JSON, nullable=True)
    blocking_dependencies = Column(JSON, nullable=True)
    systems = Column(JSON, nullable=True)

    project_id = Column(Integer, ForeignKey("projects.id"))
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", back_populates="tasks")
    sprint = relationship("Sprint", back_populates="tasks")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key   = Column(String, primary_key=True)
    value = Column(Text, nullable=True)
