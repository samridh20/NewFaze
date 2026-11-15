"""LiteLLM admin API client: per-run budget keys (Ch. 16, FR-10.10, FR-18.3).

Only Signal Lab's admin path and the workers hold the master key. Every error message is redacted, so a failure
can never print a key.
"""

from __future__ import annotations

from typing import Any

import httpx

from .redaction import redact


class LiteLLMError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(redact(message))
        self.status = status


class BudgetExceeded(LiteLLMError):
    """The router refused a call because the key's budget is spent."""


class LiteLLMAdmin:
    def __init__(self, base_url: str, master_key: str, timeout: float = 20.0) -> None:
        # LITELLM_URL ends in /v1 for the OpenAI-format endpoints. Admin routes live at the root.
        self._root = base_url.rstrip("/").removesuffix("/v1")
        self._master = master_key
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._master}", "Content-Type": "application/json"}

    async def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(method, self._root + path, headers=self._headers(), **kwargs)
        except httpx.HTTPError as exc:
            raise LiteLLMError(f"router unreachable: {type(exc).__name__}") from exc
        if response.status_code >= 400:
            raise LiteLLMError(f"router returned HTTP {response.status_code}: {response.text[:300]}",
                               response.status_code)
        return response.json() if response.content else {}

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(self._root + "/health/liveliness")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def generate_key(
        self, *, models: list[str], max_budget: float, alias: str, rpm_limit: int | None = None,
        tpm_limit: int | None = None, metadata: dict[str, Any] | None = None,
    ) -> str:
        body: dict[str, Any] = {"models": models, "max_budget": max_budget, "key_alias": alias,
                                "metadata": metadata or {}}
        if rpm_limit:
            body["rpm_limit"] = rpm_limit
        if tpm_limit:
            body["tpm_limit"] = tpm_limit
        data = await self._call("POST", "/key/generate", json=body)
        return str(data["key"])

    async def delete_key(self, key: str) -> None:
        await self._call("POST", "/key/delete", json={"keys": [key]})

    async def key_info(self, key: str) -> dict[str, Any]:
        data = await self._call("GET", "/key/info", params={"key": key})
        return dict(data.get("info", data))

    async def spend_for_alias(self, alias: str) -> dict[str, Any]:
        """Spend logs for a key alias, for the evidence files (FR-18.9)."""
        return await self._call("GET", "/spend/logs", params={"summarize": "false"})
