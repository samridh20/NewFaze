"""Redis token buckets (Ch. 12). One Lua call per check, on Redis server time."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

_LUA = """
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
tokens = math.min(capacity, tokens + (math.max(0, now - ts) / 1000.0) * rate)
local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil((cost - tokens) / rate)
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / rate * 1000) + 1000)
return {allowed, retry}
"""


class RateLimitUnavailable(Exception):
    """Redis could not be reached. Callers fail closed (A-9)."""


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._script = redis.register_script(_LUA)

    async def take(self, key: str, capacity: int, refill_per_sec: float, cost: int = 1) -> tuple[bool, int]:
        try:
            allowed, retry = await self._script(keys=[key], args=[capacity, refill_per_sec, cost])
        except (RedisError, OSError) as exc:
            raise RateLimitUnavailable(str(exc)) from exc
        return bool(allowed), int(retry)


def client_ip(request: Request, trusted_proxies: list[str]) -> str:
    """The TCP peer, unless the peer is a trusted proxy, then the last untrusted hop of X-Forwarded-For."""
    peer = request.client.host if request.client else "0.0.0.0"  # noqa: S104
    if peer not in trusted_proxies:
        return peer
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    for hop in reversed(hops):
        if hop in trusted_proxies:
            continue
        try:
            ipaddress.ip_address(hop)
        except ValueError:
            continue
        return hop
    return peer


def hash_ip(ip: str, secret: str) -> str:
    return hmac.new(secret.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]
