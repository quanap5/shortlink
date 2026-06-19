def get_tenant_id_from_event(event: dict[str, object] | None) -> str:
    if not event:
        return "default-tenant"
    request_context = event.get("requestContext")
    if not isinstance(request_context, dict):
        return "default-tenant"
    authorizer = request_context.get("authorizer")
    if not isinstance(authorizer, dict):
        return "default-tenant"
    jwt = authorizer.get("jwt")
    if not isinstance(jwt, dict):
        return "default-tenant"
    claims = jwt.get("claims")
    if not isinstance(claims, dict):
        return "default-tenant"

    tenant_id = claims.get("custom:tenant_id")
    if isinstance(tenant_id, str) and tenant_id:
        return tenant_id
    return "default-tenant"
