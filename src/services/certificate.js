// ─────────────────────────────────────────────────────────────────────────────
// QZ Tray Digital Certificate — Public certificate for QZ Tray signing
// ─────────────────────────────────────────────────────────────────────────────
// Contains the public certificate used by QZ Tray for secure printer communication.
// The certificate is safe to commit to source control (it's a public key).
// The matching private key (QZ_PRIVATE_KEY) is stored as an environment variable
// on the backend and is NEVER committed to source control.
//
// The backend uses the private key to sign messages; QZ Tray uses this certificate
// to verify the signature and establish trust with the print server.
// ─────────────────────────────────────────────────────────────────────────────

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
MIIECzCCAvOgAwIBAgIGAZ5oK+HnMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDUyNjA2NDI0NloXDTQ2MDUyNjA2NDI0NlowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC2
c9cLvv3TvdlXQzjagZz64vJvDhVKFJaT0uJUEgGqOtegP55A+i9QjMQvTOog/BEo
bOr+528bscT86MwmgKTay0UwVm2K41LeXNgbAD10ojE0zeVkPCw7zgunsfDn0bop
U1NzHPm84FXSFnBGtJrldJD1SSAY3HIegwfEd0VUjSVVt0g3kti/LANRMkoCtU2l
4O0OUZKcu3bclgdP3iM8TN1TkZxGct9eEPlZhfJkPXhch+v4CUVjStkv8Blg0ohu
lFOeBOZsOG2qaD9XKiF1VF8UDD2Xy9QZg9xN/J9z3HfoP2iX287BPhz8gpC5Cm5g
janQSblOTkJ/KXY+V6G3AgMBAAGjRTBDMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBQDpmtCg6MAOML5POo5srWc1ej6ozANBgkq
hkiG9w0BAQsFAAOCAQEAI+lAj5lcYzjH16pfJhvXeG5nQh229EdvVJWre65XGESa
XffRad/U2w9Z232TGUastvAsIN5SARPRA6Ph7MI5FjQlIxuJOwUY+rCUd5tvX+64
ePXMjgzXb2OZfknTDCElAfcI036HcmpX6DmTGDFx2+sy2x5oqqxS2k9dZ76qXv+N
rdCqQPu+SzhTSkvB24mQYN+7GG3W3moOQf23u0Y7rk3EyizhfsGQuXArE0n0+F8V
lyAO0SOE25fKR0s9SSpJYHLFQHyDrhYDGaSJezgw7ImSujnNcq1Gtn7bGwxWT6/Y
tGgwO+wbpZxWLFUTHQNZisOhRIxW5xNhvd6ELCom0A==
-----END CERTIFICATE-----
`;
// ↑↑↑ END of certificate ↑↑↑
