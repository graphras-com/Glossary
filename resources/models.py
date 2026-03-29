"""Application-specific SQLAlchemy ORM models.

When creating a new application from the template, replace these models
with your own domain entities.  The generic framework only requires that
all models inherit from :class:`app.models.Base`.
"""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class CategoryModel(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("categories.id"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)

    parent: Mapped["CategoryModel | None"] = relationship(
        "CategoryModel", remote_side=[id], lazy="selectin"
    )
    definitions: Mapped[list["DefinitionModel"]] = relationship(
        back_populates="category_rel", lazy="selectin"
    )


class TermModel(Base):
    __tablename__ = "terms"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    term: Mapped[str] = mapped_column(
        String(300), nullable=False, unique=True, index=True
    )

    definitions: Mapped[list["DefinitionModel"]] = relationship(
        back_populates="term_rel", lazy="selectin", cascade="all, delete-orphan"
    )


class DefinitionModel(Base):
    __tablename__ = "definitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    term_id: Mapped[int] = mapped_column(
        ForeignKey("terms.id", ondelete="CASCADE"), nullable=False
    )
    en: Mapped[str] = mapped_column(Text, nullable=False)
    da: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("categories.id"), nullable=False
    )

    term_rel: Mapped["TermModel"] = relationship(
        back_populates="definitions", lazy="selectin"
    )
    category_rel: Mapped["CategoryModel"] = relationship(
        back_populates="definitions", lazy="selectin"
    )
