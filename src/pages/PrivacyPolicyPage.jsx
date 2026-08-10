// ─────────────────────────────────────────────────────────────────────────────
// PrivacyPolicyPage — Public Privacy Policy page (route: /privacy)
// ─────────────────────────────────────────────────────────────────────────────
// Linked from the onboarding flow (StepOwner.jsx) and the marketing footer.
// Content is aligned with the Digital Personal Data Protection Act, 2023 (DPDP)
// and reflects the actual data flows of the Softshape.ai platform.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Mail, Phone } from 'lucide-react';

const SECTION = 'space-y-4';
const H2 = 'text-xl sm:text-2xl font-bold text-gray-900 mt-8 mb-3 tracking-tight';
const H3 = 'text-base sm:text-lg font-bold text-gray-900 mt-5 mb-2';
const P = 'text-sm sm:text-base text-gray-700 leading-relaxed';
const UL = 'list-disc pl-6 space-y-1.5 text-sm sm:text-base text-gray-700 leading-relaxed';
const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-gray-200 my-4';
const TABLE = 'w-full text-left text-xs sm:text-sm border-collapse';
const TH = 'bg-gray-50 px-3 py-2 font-bold text-gray-900 border-b border-gray-200';
const TD = 'px-3 py-2 text-gray-700 border-b border-gray-100 align-top';
const CALLOUT = 'rounded-xl bg-[#FFF5F5] border border-red-100 p-4 text-sm text-gray-700';

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-[#E53935] transition-colors"
          >
            <ArrowLeft size={16} /> Back to Softshape.ai
          </Link>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#E53935]">
            <Shield size={14} /> Privacy
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: 11 August 2026</p>

        <p className={P + ' mt-6'}>
          This Privacy Policy explains how <strong>Vtechnologies</strong> ("Softshape.ai",
          "we", "us", "our") collects, uses, discloses, stores, and protects personal data
          when you use our restaurant operating software Softshape.ai (the "Service"),
          including the cashier desktop application, admin desktop application, cashier
          Android application, admin Android application, captain Android application,
          print agent, the web application at https://softshape.ai, and any QR-code-based
          customer ordering interface we operate for our restaurant clients (collectively,
          the "Apps").
        </p>
        <p className={P}>
          This Policy is issued in accordance with the <strong>Digital Personal Data
          Protection Act, 2023 (DPDP Act)</strong> of India and any other applicable data
          protection laws.
        </p>

        {/* 1. Who we are */}
        <h2 className={H2}>1. Who we are</h2>
        <p className={P}>
          Vtechnologies is the entity that owns and operates the Softshape.ai platform. We
          are the <strong>Data Fiduciary</strong> in relation to the personal data of
          restaurant owners, their staff, and their end-customers that we process on behalf
          of our restaurant clients.
        </p>
        <ul className={UL}>
          <li><strong>Brand / website:</strong> Softshape.ai — https://softshape.ai</li>
          <li><strong>Email:</strong> softshapeai@gmail.com</li>
          <li><strong>Phone:</strong> +91-9391798370, +91-9381872579</li>
          <li><strong>Registered address:</strong> [Insert full registered address of Vtechnologies]</li>
          <li>
            <strong>Grievance Officer:</strong> [Name], reachable at [grievance@softshape.ai]
            / [phone], in accordance with the DPDP Act and Rules.
          </li>
        </ul>

        {/* 2. Data we collect */}
        <h2 className={H2}>2. The data we collect</h2>

        <h3 className={H3}>2.1 Account &amp; business data (Restaurant Owners / Administrators)</h3>
        <p className={P}>
          When a restaurant owner or administrator registers, onboards, or uses the Service,
          we collect:
        </p>
        <ul className={UL}>
          <li>Owner name, email address, mobile number, and password (stored as a salted hash).</li>
          <li>Restaurant / outlet name, slug, restaurant code, address, phone, email, GSTIN, FSSAI licence number, business type (dine-in / bar / café / cloud kitchen).</li>
          <li>Branding assets (logo, receipt header/sub-header, theme colours).</li>
          <li>Subscription and billing information: chosen plan, number of outlets, payment references, Razorpay order IDs and payment IDs, invoice history.</li>
          <li>Delete password (bcrypt hash) configured by the owner for transaction/expenditure deletion gating.</li>
          <li>Edge API keys and per-outlet configuration.</li>
        </ul>

        <h3 className={H3}>2.2 Staff / User data (Cashiers, Captains, Managers, Kitchen staff)</h3>
        <p className={P}>For each user account created by the restaurant:</p>
        <ul className={UL}>
          <li>Name, email (optional), role (Owner / Admin / Manager / Cashier / Captain / Kitchen), PIN (stored as a hash), permissions JSON.</li>
          <li>Outlet access mappings.</li>
          <li>For employees linked to payroll: name, age, role, designation, worker category, base salary, join date, staff code, attendance check-in/check-out times, salary advances, overtime, net payable, paid amount, and payroll notes.</li>
          <li>Audit log entries of actions performed (action type, entity type, entity ID, metadata, timestamp).</li>
        </ul>

        <h3 className={H3}>2.3 End-customer data (QR menu ordering)</h3>
        <p className={P}>
          When a restaurant's customer scans a table QR code and places an order through
          our customer-facing menu:
        </p>
        <ul className={UL}>
          <li>The table identifier and restaurant slug from the QR code.</li>
          <li>The items ordered, quantities, special instructions, and order status.</li>
          <li>An ephemeral session/call identifier generated on the device for waiter-call functionality.</li>
          <li>We do <strong>not</strong> collect the customer's name, phone, email, or payment details through the QR ordering interface unless the restaurant explicitly configures such a field.</li>
        </ul>

        <h3 className={H3}>2.4 Technical and usage data</h3>
        <ul className={UL}>
          <li>Device identifiers (e.g. <code>ProcessedRequest.deviceId</code>), browser type, operating system, app version.</li>
          <li>IP address (transient, for security and rate limiting).</li>
          <li>Local storage entries on the device: auth token, user profile, restaurant configuration, menu cache, table cache, edge URL, edge API key, edge runtime token.</li>
          <li>Socket.IO connection events for real-time order, table, and print-job routing.</li>
          <li>Error and crash reports sent to Sentry (sanitised; may include stack traces and request context).</li>
        </ul>

        <h3 className={H3}>2.5 Data we do NOT collect</h3>
        <ul className={UL}>
          <li>We do not collect payment card numbers, CVV, or net-banking credentials. Card and bank-account data are entered directly on Razorpay's PCI-DSS-compliant pages and never touch our servers.</li>
          <li>We do not read your personal contacts, gallery, location (unless you grant camera permission to scan a QR code), or messages.</li>
        </ul>

        {/* 3. How we collect */}
        <h2 className={H2}>3. How we collect data</h2>
        <ul className={UL}>
          <li><strong>Directly from you</strong> — when you fill in onboarding forms, login screens, employee master records, payroll entries, or contact support.</li>
          <li><strong>From your staff</strong> — when they log in, mark attendance, place orders, or generate bills.</li>
          <li><strong>From your customers</strong> — when they scan a QR code and place an order at your venue.</li>
          <li><strong>Automatically</strong> — via cookies, browser local storage, service worker caching, server logs, and analytics from our hosting and error-tracking providers.</li>
          <li><strong>From third parties</strong> — Razorpay (payment status), Firebase (phone OTP verification result), Resend (email delivery status), Cloudinary (uploaded image URLs).</li>
        </ul>

        {/* 4. Purposes */}
        <h2 className={H2}>4. Purposes and lawful basis for processing</h2>
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Data category</th>
                <th className={TH}>Purpose</th>
                <th className={TH}>Lawful basis under DPDP Act</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={TD}>Owner account data</td><td className={TD}>Provision of the Service, account administration, billing</td><td className={TD}>Consent &amp; necessary for performance of contract</td></tr>
              <tr><td className={TD}>Restaurant business data (GSTIN, FSSAI, menu, prices)</td><td className={TD}>Generating bills, KOTs, reports; tax compliance</td><td className={TD}>Consent &amp; necessary for compliance with legal obligation</td></tr>
              <tr><td className={TD}>Staff user accounts &amp; PINs</td><td className={TD}>Authentication, role-based access, audit trail</td><td className={TD}>Consent &amp; legitimate use</td></tr>
              <tr><td className={TD}>Employee payroll &amp; attendance</td><td className={TD}>Salary calculation, statutory compliance by the restaurant</td><td className={TD}>Necessary for compliance with legal obligation</td></tr>
              <tr><td className={TD}>End-customer order data</td><td className={TD}>Order fulfilment by the restaurant</td><td className={TD}>Legitimate use</td></tr>
              <tr><td className={TD}>Device IDs, IP, logs</td><td className={TD}>Security, fraud prevention, rate limiting, idempotency</td><td className={TD}>Legitimate use</td></tr>
              <tr><td className={TD}>Razorpay payment metadata</td><td className={TD}>Subscription billing reconciliation</td><td className={TD}>Consent &amp; contract</td></tr>
              <tr><td className={TD}>Phone OTP / email OTP</td><td className={TD}>Authentication, account recovery</td><td className={TD}>Consent</td></tr>
              <tr><td className={TD}>Sentry error reports</td><td className={TD}>Service stability and debugging</td><td className={TD}>Legitimate use</td></tr>
              <tr><td className={TD}>Cloudinary image URLs</td><td className={TD}>Menu image storage and display</td><td className={TD}>Consent</td></tr>
            </tbody>
          </table>
        </div>
        <p className={P}>
          We do <strong>not</strong> use any personal data for behavioural advertising or
          for training any external third-party AI model. Internal AI-assisted features
          (such as menu parsing from PDF/Excel) operate on the document you upload and the
          resulting structured menu only.
        </p>

        {/* 5. Third-party processors */}
        <h2 className={H2}>5. Third-party processors</h2>
        <p className={P}>
          We engage the following categories of processors to operate the Service. Each
          processor is bound by appropriate data-processing terms.
        </p>
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Processor</th>
                <th className={TH}>Purpose</th>
                <th className={TH}>Data shared</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={TD}>Razorpay</td><td className={TD}>Subscription payment collection</td><td className={TD}>Owner name, email, phone, payment amount, order ID</td></tr>
              <tr><td className={TD}>Google Firebase</td><td className={TD}>Phone OTP verification</td><td className={TD}>Phone number, OTP, verification result</td></tr>
              <tr><td className={TD}>Resend</td><td className={TD}>Transactional email &amp; email OTP</td><td className={TD}>Email address, OTP, delivery status</td></tr>
              <tr><td className={TD}>Cloudinary</td><td className={TD}>Menu and bar image hosting</td><td className={TD}>Uploaded image files, restaurant ID</td></tr>
              <tr><td className={TD}>Sentry</td><td className={TD}>Error and crash monitoring</td><td className={TD}>Sanitised stack traces, request context, device info</td></tr>
              <tr><td className={TD}>Hosting provider (Railway / Render / cloud VPS)</td><td className={TD}>Application and database hosting</td><td className={TD}>All operational data</td></tr>
              <tr><td className={TD}>AWS S3 (optional)</td><td className={TD}>Offsite database backups</td><td className={TD}>Encrypted PostgreSQL dump files</td></tr>
              <tr><td className={TD}>Google Fonts / cdnjs / unpkg</td><td className={TD}>Font and client-side library delivery</td><td className={TD}>IP address (transient)</td></tr>
            </tbody>
          </table>
        </div>
        <p className={P}>
          Some of these processors may process data outside India. Where this occurs, we
          rely on the lawful basis of consent and the legitimate use provisions of the
          DPDP Act, and we ensure appropriate safeguards are in place.
        </p>

        {/* 6. Retention */}
        <h2 className={H2}>6. Data retention</h2>
        <ul className={UL}>
          <li><strong>Active account data:</strong> Retained for as long as your Softshape.ai account is active.</li>
          <li><strong>Transaction, order, KOT, and audit data:</strong> Retained for the lifetime of the account plus <strong>7 years</strong> to support GST audit and Indian tax-record requirements, unless you request earlier deletion and no legal hold applies.</li>
          <li><strong>Payroll and attendance records:</strong> Retained for the lifetime of the account plus <strong>7 years</strong> to support Indian labour-law and tax-record requirements.</li>
          <li><strong>Backup files:</strong> Daily / weekly / monthly PostgreSQL backups are rotated; the longest retention is the monthly backup retained for <strong>12 months</strong>, after which it is overwritten.</li>
          <li><strong>OTP data:</strong> Phone/email OTPs are stored in Redis for a maximum of <strong>10 minutes</strong> and then automatically purged.</li>
          <li><strong>Reset tokens:</strong> Cryptographically random, expire after 30 minutes, and are deleted on use.</li>
          <li><strong>Sentry events:</strong> Retained for <strong>90 days</strong>.</li>
          <li><strong>Inactive accounts:</strong> If an account is inactive for <strong>24 months</strong>, we will attempt to notify the owner before purging business data, subject to legal-hold requirements.</li>
        </ul>

        {/* 7. Security */}
        <h2 className={H2}>7. Data security</h2>
        <p className={P}>We implement industry-standard technical and organisational measures:</p>
        <ul className={UL}>
          <li><strong>Authentication:</strong> JWT access tokens with short expiry, refresh tokens, optional PIN login, role-based access control.</li>
          <li><strong>Tenant isolation:</strong> Every database query is automatically scoped by <code>restaurantId</code> at the Prisma ORM layer to prevent cross-tenant data leakage.</li>
          <li><strong>Encryption in transit:</strong> TLS 1.2+ for all client-server and inter-service traffic.</li>
          <li><strong>Secrets management:</strong> JWT secrets, Razorpay keys, Firebase service-account keys, Cloudinary secrets, and database URLs are stored as server-side environment variables and are never committed to source control.</li>
          <li><strong>Password storage:</strong> bcrypt / salted hashes. We never store plaintext passwords.</li>
          <li><strong>Hardening:</strong> Helmet, CORS allow-lists, per-route rate limiting, raw-body preservation for Razorpay HMAC verification, cryptographic reset tokens (<code>crypto.randomBytes</code> / <code>crypto.randomUUID</code>).</li>
          <li><strong>Audit logging:</strong> All sensitive actions are recorded in <code>AuditLog</code> with user, entity, and metadata.</li>
          <li><strong>Backups:</strong> Encrypted PostgreSQL dumps with optional offsite S3 upload.</li>
          <li><strong>Vendor hardening:</strong> We require processors to maintain their own security certifications (e.g. Razorpay PCI-DSS, Cloudinary SOC 2, Sentry SOC 2).</li>
        </ul>
        <p className={P}>
          Despite these measures, no system is 100% secure. In the event of a personal-data
          breach affecting you, we will notify the Data Protection Board of India and
          affected data principals within the timelines required under the DPDP Act.
        </p>

        {/* 8. Rights */}
        <h2 className={H2}>8. Your rights (Data Principal rights)</h2>
        <p className={P}>Under the DPDP Act, you have the right to:</p>
        <ol className="list-decimal pl-6 space-y-1.5 text-sm sm:text-base text-gray-700 leading-relaxed">
          <li><strong>Access</strong> a summary of your personal data processed by us.</li>
          <li><strong>Correction and completion</strong> of inaccurate or incomplete data.</li>
          <li><strong>Erasure</strong> of your personal data, except where retention is required by law (e.g. GST records).</li>
          <li><strong>Grievance redressal</strong> — contact our Grievance Officer (Section 1).</li>
          <li><strong>Nominate</strong> another individual to exercise your rights in the event of your death or incapacity.</li>
          <li><strong>Withdraw consent</strong> at any time — withdrawal does not affect the lawfulness of prior processing.</li>
        </ol>
        <p className={P}>
          To exercise any right, email [grievance@softshape.ai] with the subject "DPDP
          Rights Request" and your registered email / phone. We will respond within
          <strong> 30 days</strong>.
        </p>

        {/* 9. Rights of staff and customers */}
        <h2 className={H2}>9. Rights of your staff and customers</h2>
        <p className={P}>If you are a restaurant owner, you acknowledge that:</p>
        <ul className={UL}>
          <li>You are the <strong>Data Fiduciary</strong> for your staff's employment data and your customers' order data.</li>
          <li>Softshape.ai acts as your <strong>Data Processor</strong> for that data, processing it solely to deliver the Service to you.</li>
          <li>You are responsible for obtaining necessary consents from your staff and customers and for displaying a privacy notice at your venue where QR-code ordering is enabled.</li>
        </ul>

        {/* 10. Children */}
        <h2 className={H2}>10. Children's data</h2>
        <p className={P}>
          The Service is a business-to-business product and is not directed at individuals
          under 18. We do not knowingly collect personal data from children. If you believe
          a minor's data has been collected, contact us and we will delete it.
        </p>

        {/* 11. Cookies */}
        <h2 className={H2}>11. Cookies and local storage</h2>
        <ul className={UL}>
          <li>We use <strong>browser local storage</strong> (not cookies) to keep you logged in, cache your menu and table data for offline use, and remember your edge-server URL.</li>
          <li>We use a <strong>service worker</strong> to cache web assets so the app works offline.</li>
          <li>We do <strong>not</strong> use advertising or cross-site tracking cookies.</li>
          <li>Google Fonts and CDN scripts may set their own cookies; you can disable these in your browser settings.</li>
        </ul>

        {/* 12. International transfers */}
        <h2 className={H2}>12. International transfers</h2>
        <p className={P}>
          Some processors (Cloudinary, Sentry, Google Fonts, Firebase) may process data
          outside India. By using the Service, you consent to such transfers subject to the
          safeguards described in Section 5.
        </p>

        {/* 13. Changes */}
        <h2 className={H2}>13. Changes to this Policy</h2>
        <p className={P}>
          We may update this Policy from time to time. We will notify owners by email and
          via an in-app banner of any material change at least <strong>14 days</strong>
          before it takes effect. Continued use after the effective date constitutes
          acceptance.
        </p>

        {/* 14. Contact */}
        <h2 className={H2}>14. Contact</h2>
        <div className={CALLOUT}>
          <p className="font-bold text-gray-900 mb-2">For any privacy questions, requests, or complaints:</p>
          <p className="flex items-center gap-2 mb-1">
            <Mail size={14} className="text-[#E53935]" />
            <a href="mailto:softshapeai@gmail.com" className="text-[#E53935] hover:underline">softshapeai@gmail.com</a>
            <span className="text-gray-400">/</span>
            <a href="mailto:grievance@softshape.ai" className="text-[#E53935] hover:underline">grievance@softshape.ai</a>
          </p>
          <p className="flex items-center gap-2">
            <Phone size={14} className="text-[#E53935]" />
            +91-9391798370 / +91-9381872579
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Postal: [Registered address of Vtechnologies]
          </p>
        </div>

        <p className="mt-10 text-center text-xs text-gray-400">
          <Link to="/terms" className="text-[#E53935] hover:underline">Terms &amp; Conditions</Link>
          {' · '}
          <Link to="/" className="text-gray-500 hover:underline">Softshape.ai</Link>
        </p>
      </article>
    </div>
  );
};

export default PrivacyPolicyPage;
