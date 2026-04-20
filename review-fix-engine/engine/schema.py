from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class Severity(str, Enum):
    MUST_FIX = "must-fix"
    NICE_TO_HAVE = "nice-to-have"


class Category(str, Enum):
    CORRECTNESS = "correctness"
    SECURITY = "security"
    STYLE = "style"
    TESTING = "testing"
    OTHER = "other"


class Finding(BaseModel):
    id: str = Field(description="Unique ID like F-001")
    severity: Severity
    category: Category
    claim: str = Field(description="One-sentence description")
    reasoning: str = Field(default="", description="Why this is a problem")
    file: str = Field(description="File path relative to repo root")
    line_start: int = Field(ge=1)
    line_end: int = Field(ge=1)
    quoted_code: str = Field(description="Verbatim code from the diff")
    suggested_fix: str = Field(description="Concrete fix")
    source_reviewer: str = Field(default="", description="Which reviewer found this")

    @model_validator(mode="after")
    def check_line_range(self) -> "Finding":
        if self.line_end < self.line_start:
            raise ValueError(f"line_end ({self.line_end}) < line_start ({self.line_start})")
        return self


class ReviewOutput(BaseModel):
    summary: str = Field(default="")
    findings: list[Finding] = Field(default_factory=list)


class GroundResult(BaseModel):
    grounded: list[Finding] = Field(default_factory=list)
    dropped: list[dict] = Field(default_factory=list)
    raw_count: int = 0
    grounded_count: int = 0
    dropped_count: int = 0
    hallucination_rate: float = 0.0
