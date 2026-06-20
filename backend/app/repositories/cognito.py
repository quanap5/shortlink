import base64
import hashlib
import hmac

import boto3
from botocore.exceptions import ClientError

from app.domain.errors import TenantRegistrationError
from app.services.tenants import CognitoRegistrationUser


class CognitoRegistrationAdapter:
    def __init__(self, *, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._client = boto3.client("cognito-idp")

    def sign_up_owner(self, user: CognitoRegistrationUser) -> None:
        try:
            self._client.sign_up(
                ClientId=self._client_id,
                SecretHash=compute_secret_hash(
                    username=user.email,
                    client_id=self._client_id,
                    client_secret=self._client_secret,
                ),
                Username=user.email,
                Password=user.password,
                UserAttributes=[
                    {"Name": "email", "Value": user.email},
                    {"Name": "custom:tenant_id", "Value": user.tenant_id},
                    {"Name": "custom:role", "Value": user.role},
                ],
            )
        except ClientError as exc:
            raise TenantRegistrationError("Unable to register user.") from exc

    def confirm_owner_email(self, *, email: str, confirmation_code: str) -> None:
        try:
            self._client.confirm_sign_up(
                ClientId=self._client_id,
                SecretHash=compute_secret_hash(
                    username=email,
                    client_id=self._client_id,
                    client_secret=self._client_secret,
                ),
                Username=email,
                ConfirmationCode=confirmation_code,
            )
        except ClientError as exc:
            raise TenantRegistrationError("Unable to verify email.") from exc


def compute_secret_hash(*, username: str, client_id: str, client_secret: str) -> str:
    message = f"{username}{client_id}".encode()
    digest = hmac.new(client_secret.encode(), message, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")
