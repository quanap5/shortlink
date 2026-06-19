class ShortLinkError(Exception):
    """Base application error."""


class LinkAlreadyExistsError(ShortLinkError):
    """Raised when a tenant already owns the requested slug."""


class LinkNotFoundError(ShortLinkError):
    """Raised when a tenant link cannot be found."""
