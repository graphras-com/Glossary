"""Application-specific Pydantic request/response schemas.

When creating a new application from the template, replace these schemas
with your own domain-specific validation models.
"""

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------


class CategoryCreate(BaseModel):
    id: str = Field(..., min_length=1, examples=["network.mobile"])
    parent_id: str | None = Field(None, examples=["network"])
    label: str = Field(..., min_length=1, examples=["Mobile"])


class CategoryRead(BaseModel):
    id: str
    parent_id: str | None
    label: str

    model_config = {"from_attributes": True}


class CategoryUpdate(BaseModel):
    parent_id: str | None = None
    label: str | None = Field(None, min_length=1)


# ---------------------------------------------------------------------------
# Definition
# ---------------------------------------------------------------------------


class DefinitionCreate(BaseModel):
    en: str = Field(..., min_length=1)
    da: str | None = Field(None, min_length=1)
    category_id: str = Field(..., min_length=1)


class DefinitionRead(BaseModel):
    id: int
    en: str
    da: str | None
    category_id: str

    model_config = {"from_attributes": True}


class DefinitionUpdate(BaseModel):
    en: str | None = Field(None, min_length=1)
    da: str | None = None
    category_id: str | None = Field(None, min_length=1)


class DefinitionRecommendRequest(BaseModel):
    term: str = Field(..., min_length=1)
    category_id: str | None = Field(None, min_length=1)


class DefinitionRecommendResponse(BaseModel):
    en: str
    da: str
    model: str


# ---------------------------------------------------------------------------
# Glossary extraction from free text
# ---------------------------------------------------------------------------


class GlossaryExtractRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000)


# ---------------------------------------------------------------------------
# Term
# ---------------------------------------------------------------------------


class TermCreate(BaseModel):
    term: str = Field(..., min_length=1)
    definitions: list[DefinitionCreate] = Field(..., min_length=1)


class TermRead(BaseModel):
    id: int
    term: str
    definitions: list[DefinitionRead]

    model_config = {"from_attributes": True}


class TermUpdate(BaseModel):
    term: str | None = Field(None, min_length=1)


# ---------------------------------------------------------------------------
# Backup / Restore  (application-specific backup shapes)
# ---------------------------------------------------------------------------


class BackupDefinition(BaseModel):
    en: str
    da: str | None = None
    category_id: str


class BackupTerm(BaseModel):
    term: str
    definitions: list[BackupDefinition]


class BackupCategory(BaseModel):
    id: str
    parent_id: str | None = None
    label: str


class BackupPayload(BaseModel):
    version: int = 1
    categories: list[BackupCategory]
    terms: list[BackupTerm]
