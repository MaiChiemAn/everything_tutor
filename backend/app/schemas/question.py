from datetime import datetime
import json
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator

Choice = Literal["A", "B", "C", "D"]
RichDocument = dict[str, Any]

_NODE_TYPES = {"doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak", "horizontalRule"}
_MARK_TYPES = {"bold", "italic", "strike", "code"}
_LANGUAGES = {"python", "py", "text", "plaintext", "javascript", "typescript", "json", "bash"}


def normalize_document(value: Any, allow_empty: bool = False) -> Optional[RichDocument]:
    if value is None and allow_empty:
        return None
    if isinstance(value, str):
        if not value and allow_empty:
            return None
        lines = value.split("\n")
        value = {"type": "doc", "content": [{"type": "paragraph", **({"content": [{"type": "text", "text": line}]} if line else {})} for line in lines]}
    if not isinstance(value, dict) or value.get("type") != "doc" or not isinstance(value.get("content"), list) or set(value) - {"type", "content"}:
        raise ValueError("Rich content must be a TipTap document")

    char_count = 0
    node_count = 0

    def validate_node(node: Any, depth: int = 0) -> None:
        nonlocal char_count, node_count
        node_count += 1
        if node_count > 500 or depth > 20 or not isinstance(node, dict):
            raise ValueError("Rich content is too large or deeply nested")
        node_type = node.get("type")
        if not isinstance(node_type, str) or node_type not in _NODE_TYPES or set(node) - {"type", "text", "attrs", "marks", "content"}:
            raise ValueError("Rich content contains an unsupported node")
        if "text" in node:
            if node_type != "text" or not isinstance(node["text"], str):
                raise ValueError("Invalid rich text node")
            char_count += len(node["text"])
            if char_count > 25000:
                raise ValueError("Rich content exceeds 25,000 characters")
        marks = node.get("marks", [])
        if not isinstance(marks, list) or any(not isinstance(mark, dict) or mark.get("type") not in _MARK_TYPES for mark in marks):
            raise ValueError("Rich content contains an unsupported text mark")
        attrs = node.get("attrs", {})
        if not isinstance(attrs, dict):
            raise ValueError("Invalid rich text attributes")
        if node_type == "heading" and attrs.get("level", 1) not in (1, 2, 3):
            raise ValueError("Headings can use levels 1 through 3")
        if node_type == "codeBlock":
            language = attrs.get("language")
            if language is not None and (not isinstance(language, str) or language not in _LANGUAGES):
                raise ValueError("Unsupported code block language")
        children = node.get("content", [])
        if not isinstance(children, list):
            raise ValueError("Invalid rich text children")
        for child in children:
            validate_node(child, depth + 1)

    for child in value["content"]:
        validate_node(child, 1)
    if not allow_empty and char_count == 0:
        raise ValueError("Rich content cannot be empty")
    if allow_empty and char_count == 0:
        return None
    # Bound total serialized JSON size as well as visible text length.
    try:
        serialized = json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        raise ValueError("Rich content must contain JSON-compatible values")
    if len(serialized) > 100000:
        raise ValueError("Rich content document is too large")
    return value


class QuestionInput(BaseModel):
    content: RichDocument
    option_a: RichDocument
    option_b: RichDocument
    option_c: RichDocument
    option_d: RichDocument
    correct_answer: Choice
    explanation: Optional[RichDocument] = None

    @field_validator("content", "option_a", "option_b", "option_c", "option_d", mode="before")
    @classmethod
    def validate_required_document(cls, value: Any) -> RichDocument:
        return normalize_document(value)  # type: ignore[return-value]

    @field_validator("explanation", mode="before")
    @classmethod
    def validate_optional_document(cls, value: Any) -> Optional[RichDocument]:
        return normalize_document(value, allow_empty=True)


class QuestionOut(QuestionInput):
    id: int
    collection_id: int
    created_at: datetime
    model_config = {"from_attributes": True}


class QuizQuestionOut(BaseModel):
    id: int
    content: RichDocument
    option_a: RichDocument
    option_b: RichDocument
    option_c: RichDocument
    option_d: RichDocument
    model_config = {"from_attributes": True}

    @classmethod
    def from_question(cls, q):
        return cls.model_validate(q)
