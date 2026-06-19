class ShortLinkError(Exception):
    """Base application error."""


class LinkAlreadyExistsError(ShortLinkError):
    """Raised when a tenant already owns the requested slug."""


class LinkNotFoundError(ShortLinkError):
    """Raised when a tenant link cannot be found."""


class LinkInactiveError(ShortLinkError):
    """Raised when a link exists but cannot redirect."""


class TenantAlreadyExistsError(ShortLinkError):
    """Raised when a tenant id is already registered."""


class TenantRegistrationError(ShortLinkError):
    """Raised when tenant registration cannot be completed."""
