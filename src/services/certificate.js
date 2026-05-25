/**
 * QZ Tray Digital Certificate
 *
 * HOW TO GET YOUR CERTIFICATE:
 * 1. Open QZ Tray Sign Message Tool or generate a key pair using:
 *      qz-tray --gen-keypair
 * 2. Copy the content of your digital-certificate.txt file
 * 3. Paste it below, replacing the placeholder string (including the
 *    -----BEGIN CERTIFICATE----- and -----END CERTIFICATE----- lines).
 *
 * IMPORTANT:
 * - Keep the backtick template literal format — it preserves newlines correctly.
 * - The private key (from private-key.pem) goes in the Render environment
 *   variable QZ_PRIVATE_KEY — NEVER commit the private key to source control.
 * - This certificate (public key) is safe to commit and ship in the frontend.
 */

// ↓↓↓ PASTE your digital-certificate.txt contents here ↓↓↓
export const QZ_CERT = `-----BEGIN CERTIFICATE-----
MIIDvzCCAqegAwIBAgIUNi8y+/rtKzCntryz4ATlFmiuVLUwDQYJKoZIhvcNAQEL
BQAwbzELMAkGA1UEBhMCSU4xFzAVBgNVBAgMDkFuZGhyYSBQcmFkZXNoMQ8wDQYD
VQQHDAZPbmdvbGUxDzANBgNVBAMMBlZncmFuZDElMCMGCSqGSIb3DQEJARYWdmdy
YW5kbG91bmdlQGdtYWlsLmNvbTAeFw0yNjA1MjUwNTM3MDBaFw0zNjA1MjIwNTM3
MDBaMG8xCzAJBgNVBAYTAklOMRcwFQYDVQQIDA5BbmRocmEgUHJhZGVzaDEPMA0G
A1UEBwwGT25nb2xlMQ8wDQYDVQQDDAZWZ3JhbmQxJTAjBgkqhkiG9w0BCQEWFnZn
cmFuZGxvdW5nZUBnbWFpbC5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDEuLOPIo2Gx03lqZ4YAcAIrZ9linP7d3rvElYtSGlz0yQ53TFC4W8W/Nm3
B7WpqyiavXls+ae5Gp04JuWR4U52Ugxd9SuidxNdWfuOBY1bRK+cTzmJ6vE+22zD
NNp3hTkbZMzVavXSQFIn9Bze8lx0CjEkFXaLww8jM3vU8goTo9RZMeaXvvcBlki9
RG11cITr27eRvzS8wVtWau04XI9JVZXLxc21RN4vFh8JOvJtrQuoR159JHKx3tfz
4osyMpxgdz8i9Dj1CNtkH+tjxIJ5cGRle87LB5W71TighCy2qD+n1R0ENDzg6o9J
U9LQCR2JjqCXYMl0IXk+L0xiW98fAgMBAAGjUzBRMB0GA1UdDgQWBBSxlBeH43kP
q9ivvaOyxYXyMRPq9zAfBgNVHSMEGDAWgBSxlBeH43kPq9ivvaOyxYXyMRPq9zAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQC4QeHZZFkI+DsIHk3n
tFCAg6QfyVEhIg2d1+aBVyw39MVLgXlOGlMn3qZDB9PM2LD/ayTCP8EzBukdt9v9
V8S8FPVO8UHva7dYSUYWQon7CEzhRBjOK1k5P3ZLeCH841XSb9U603JDFIVHq8eC
7BuCnKIdg20MlueH+p368nYjNxWlFIQmp7P2sST5GXhSYH8L8FqRvzO1WmCtZK7G
3Oktr6zFE0JWS6eySeKxvsNyh0Js0vGErjxxqfDWETQ3qr52Df02lW58qofKAPPx
ylqgYTH614bO4NBxLkEAHmCCv40MP3M/Be99bQEvYsHgfkRsWuwxhjTa//Q9Mo4B
RtT6
-----END CERTIFICATE-----
`;
// ↑↑↑ END of certificate ↑↑↑
