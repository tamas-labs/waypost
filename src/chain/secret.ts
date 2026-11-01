// The device secret: the key of the chain's HMAC.

/** 32 bytes in base64, as POST /devices/enroll returns it. */
export const isDeviceSecret = (value: string) => /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(value);
