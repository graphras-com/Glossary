from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CategoryModel
from app.schemas import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryRead])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CategoryModel).order_by(CategoryModel.id))
    return result.scalars().all()


@router.get("/{category_id}", response_model=CategoryRead)
async def get_category(category_id: str, db: AsyncSession = Depends(get_db)):
    cat = await db.get(CategoryModel, category_id)
    if not cat:
        raise HTTPException(404, detail="Category not found")
    return cat


@router.post("/", response_model=CategoryRead, status_code=201)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.get(CategoryModel, body.id)
    if existing:
        raise HTTPException(409, detail="Category already exists")
    if body.parent_id:
        parent = await db.get(CategoryModel, body.parent_id)
        if not parent:
            raise HTTPException(
                422, detail=f"Parent category '{body.parent_id}' not found"
            )
    cat = CategoryModel(id=body.id, parent_id=body.parent_id, label=body.label)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: str, body: CategoryUpdate, db: AsyncSession = Depends(get_db)
):
    cat = await db.get(CategoryModel, category_id)
    if not cat:
        raise HTTPException(404, detail="Category not found")
    updates = body.model_dump(exclude_unset=True)
    if "parent_id" in updates and updates["parent_id"] is not None:
        parent = await db.get(CategoryModel, updates["parent_id"])
        if not parent:
            raise HTTPException(
                422, detail=f"Parent category '{updates['parent_id']}' not found"
            )
    for key, value in updates.items():
        setattr(cat, key, value)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db)):
    cat = await db.get(CategoryModel, category_id)
    if not cat:
        raise HTTPException(404, detail="Category not found")
    await db.delete(cat)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            409,
            detail=f"Category '{category_id}' is still referenced by definitions or child categories",
        ) from None
