from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class CollectionInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=5000)
    is_published: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Collection name cannot be blank")
        return value


class CollectionOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_by: int
    is_published: bool
    created_at: datetime
    updated_at: datetime
    question_count: int
