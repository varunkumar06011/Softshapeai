// ─────────────────────────────────────────────────────────────────────────────
// TermsPage — Public Terms & Conditions page (route: /terms)
// ─────────────────────────────────────────────────────────────────────────────
// Linked from the onboarding flow (StepOwner.jsx) and the marketing footer.
// Content is aligned with Indian contract law, the DPDP Act 2023, the Consumer
// Protection Act 2019, and the actual data / billing flows of Softshape.ai.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, Phone } from 'lucide-react';

const H2 = 'text-xl sm:text-2xl font-bold text-gray-900 mt-8 mb-3 tracking-tight';
const H3 = 'text-base sm:text-lg font-bold text-gray-900 mt-5 mb-2';
const P = 'text-sm sm:text-base text-gray-700 leading-relaxed';
const UL = 'list-disc pl-6 space-y-1.5 text-sm sm:text-base text-gray-700 leading-relaxed';
const OL = 'list-decimal pl-6 space-y-1.5 text-sm sm:text-base text-gray-700 leading-relaxed';
const CALLOUT = 'rounded-xl bg-[#FFF5F5] border border-red-100 p-4 text-sm text-gray-700';

const TermsPage = () => {
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
            <FileText size={14} /> Terms
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: 11 August 2026</p>

        <p className={P + ' mt-6'}>
          These Terms of Service ("Terms") govern your access to and use of the Softshape.ai
          platform, including all web, desktop, Android, iPad, and print-agent applications
          (the "Service"), operated by <strong>Vtechnologies</strong> ("we", "us", "our"). By
          registering, onboarding, logging in, or otherwise using the Service, you ("you",
          "Customer") agree to these Terms. If you do not agree, do not use the Service.
        </p>

        {/* 1. Definitions */}
        <h2 className={H2}>1. Definitions</h2>
        <ul className={UL}>
          <li><strong>"Customer"</strong>, <strong>"Restaurant"</strong>, or <strong>"Outlet"</strong> — the business entity that registers for the Service.</li>
          <li><strong>"Authorised User"</strong> — any individual (owner, manager, cashier, captain, kitchen staff) the Customer authorises to use the Service under its account.</li>
          <li><strong>"End-Customer"</strong> — a patron of the Restaurant who uses the QR-code ordering interface.</li>
          <li><strong>"Edge Device"</strong> — any on-premise device running the Softshape print agent or edge server.</li>
          <li><strong>"Plan"</strong> — the subscription tier selected during onboarding.</li>
        </ul>

        {/* 2. Eligibility */}
        <h2 className={H2}>2. Eligibility and authority</h2>
        <ol className={OL}>
          <li>You must be a legally registered business or proprietor in India (or the jurisdiction in which you operate) to register as a Customer.</li>
          <li>The individual completing onboarding represents and warrants that they are at least <strong>18 years old</strong> and have the legal authority to bind the Restaurant to these Terms.</li>
          <li>You are responsible for all activity under your account and for all Authorised Users you create.</li>
        </ol>

        {/* 3. Account registration */}
        <h2 className={H2}>3. Account registration and onboarding</h2>
        <ol className={OL}>
          <li>To register, you must provide accurate owner name, email, mobile number, password, and restaurant details (name, type, GSTIN where applicable, FSSAI licence where applicable).</li>
          <li>Phone verification is performed via Firebase OTP. Email verification may be performed via Resend OTP.</li>
          <li>Your <code>restaurantCode</code> and <code>slug</code> are system-generated and may not be guaranteed to match a requested value if already taken.</li>
          <li>You must maintain the security of your password, PIN, and edge API keys, and promptly notify us of any unauthorised access.</li>
        </ol>

        {/* 4. Subscription */}
        <h2 className={H2}>4. Subscription, billing, and payment</h2>
        <ol className={OL}>
          <li>The Service is offered on a subscription basis with a free trial and paid plans as published at https://softshape.ai at the time of sign-up.</li>
          <li>Subscription fees are billed in INR through <strong>Razorpay</strong>. By initiating a payment, you agree to Razorpay's terms and privacy policy.</li>
          <li><strong>Trial:</strong> Trial length and feature scope are as published. We may end or modify a trial at any time.</li>
          <li><strong>Auto-renewal:</strong> Unless cancelled before the end of the billing period, subscriptions auto-renew for the same period at the then-current price.</li>
          <li><strong>Refunds:</strong> Refunds, if any, are at our sole discretion and governed by the refund policy published with your Plan. Statutory rights remain unaffected.</li>
          <li><strong>Taxes:</strong> All fees are exclusive of GST and applicable taxes, which will be added to your invoice.</li>
          <li><strong>Price changes:</strong> We may change pricing with at least <strong>30 days'</strong> notice by email. You may cancel before the change takes effect.</li>
          <li><strong>Late payment / suspension:</strong> Overdue invoices may result in service suspension after a <strong>7-day</strong> grace period, with read-only access preserved for an additional <strong>30 days</strong> to allow data export.</li>
        </ol>

        {/* 5. Licence */}
        <h2 className={H2}>5. Licence grant</h2>
        <p className={P}>
          Subject to your continued compliance with these Terms and payment of applicable
          fees, we grant you a <strong>limited, non-exclusive, non-transferable,
          revocable</strong> licence to access and use the Service solely for your internal
          restaurant operations for the duration of your subscription.
        </p>
        <p className={P}>You may not:</p>
        <ul className={UL}>
          <li>Resell, white-label, or sublicense the Service to third parties.</li>
          <li>Reverse engineer, decompile, or disassemble any part of the Service, except to the extent permitted by law.</li>
          <li>Remove or alter any proprietary notices.</li>
          <li>Use the Service to compete with us or to build a similar product.</li>
        </ul>

        {/* 6. Acceptable use */}
        <h2 className={H2}>6. Acceptable use</h2>
        <p className={P}>You agree not to, and not to allow any Authorised User to:</p>
        <ol className={OL}>
          <li>Use the Service for any illegal, fraudulent, or unauthorised purpose.</li>
          <li>Upload malware or attempt to compromise the Service's security.</li>
          <li>Attempt to access another Restaurant's data (tenant isolation is enforced at the ORM layer; circumvention attempts are logged and may be reported to authorities).</li>
          <li>Abuse rate limits, scrape the Service, or use automated tools to overload our servers.</li>
          <li>Process personal data through the Service in violation of the DPDP Act or any other applicable law.</li>
          <li>Use the customer-facing QR ordering interface to collect customer data not disclosed in your venue's privacy notice.</li>
          <li>Disable, bypass, or interfere with billing, audit logging, or print-routing logic.</li>
          <li>Share your account credentials across more than the licensed number of devices/users.</li>
        </ol>

        {/* 7. Customer responsibilities */}
        <h2 className={H2}>7. Customer responsibilities</h2>
        <ol className={OL}>
          <li><strong>Hardware and connectivity:</strong> You are responsible for printers, devices, network, and internet connectivity required to use the Service. The Service is offline-first but requires periodic connectivity for sync and billing.</li>
          <li><strong>Printer configuration:</strong> You are responsible for correct printer assignment per category, KOT routing, and ESC/POS compatibility. We are not liable for mis-routed or failed prints caused by misconfiguration.</li>
          <li><strong>Staff management:</strong> You are responsible for creating, deactivating, and managing Authorised User accounts and for terminating access of staff who leave your employment.</li>
          <li><strong>Statutory compliance:</strong> You are solely responsible for the accuracy of your GSTIN, FSSAI licence, GST rates, service-charge configuration, and tax filings generated from the Service. We provide tooling; we do not provide tax or legal advice.</li>
          <li><strong>End-customer notices:</strong> Where you enable QR ordering, you are responsible for displaying any privacy notice required by law at your venue.</li>
          <li><strong>Data accuracy:</strong> You are responsible for the accuracy of menu prices, payroll data, attendance records, and inventory entered into the Service.</li>
          <li><strong>Backups:</strong> While we maintain server-side backups, you are encouraged to export your data periodically. We are not liable for data loss caused solely by your failure to export.</li>
        </ol>

        {/* 8. Multi-tenant */}
        <h2 className={H2}>8. Multi-tenant isolation and data ownership</h2>
        <ol className={OL}>
          <li><strong>Data ownership:</strong> All business data (menu, orders, transactions, payroll, inventory, customers, audit logs) you enter into the Service remains your property. We process it as your Data Processor.</li>
          <li><strong>Tenant isolation:</strong> We enforce per-restaurant data isolation at the ORM layer. We do not share your data with other Restaurants.</li>
          <li><strong>Aggregated and anonymised data:</strong> We may use aggregated, de-identified data for product improvement, benchmarking, and marketing (e.g. "average bill time across all Softshape venues"). Such data is not re-identifiable.</li>
          <li><strong>Data processing addendum:</strong> Available on request from [grievance@softshape.ai].</li>
        </ol>

        {/* 9. Availability */}
        <h2 className={H2}>9. Service availability</h2>
        <ol className={OL}>
          <li>The Service is designed to be <strong>offline-first</strong>: cashier and captain apps continue to operate without internet and sync when connectivity returns.</li>
          <li>Scheduled maintenance is announced at least <strong>48 hours</strong> in advance where possible.</li>
          <li>We target <strong>99.5%</strong> uptime for the cloud backend on paid plans, excluding (a) internet outages between your device and our servers, (b) force majeure events, (c) issues caused by third-party processors, and (d) planned maintenance.</li>
          <li><strong>Free tier / trial:</strong> No uptime commitment applies. We may throttle, suspend, or discontinue the free tier with 30 days' notice.</li>
        </ol>

        {/* 10. Updates */}
        <h2 className={H2}>10. Updates to the Service</h2>
        <p className={P}>
          We may update, add, or remove features at any time. Material feature removals
          affecting paid Customers will be communicated with at least <strong>30 days'</strong>
          notice and may give rise to a pro-rated refund right at our discretion.
        </p>

        {/* 11. IP */}
        <h2 className={H2}>11. Intellectual property</h2>
        <ol className={OL}>
          <li>The Service, including software, design, logos, documentation, and the "Softshape.ai" brand, is owned by Vtechnologies and protected by Indian IP laws.</li>
          <li>Feedback you provide may be used by us without restriction or compensation.</li>
          <li>You retain all rights to your business data, menu content, and branding assets uploaded to the Service.</li>
        </ol>

        {/* 12. Confidentiality */}
        <h2 className={H2}>12. Confidentiality</h2>
        <p className={P}>
          Each party will keep the other's non-public information confidential and use it
          only to perform under these Terms. This obligation survives termination for
          <strong> 3 years</strong>.
        </p>

        {/* 13. Term and termination */}
        <h2 className={H2}>13. Term and termination</h2>
        <ol className={OL}>
          <li>These Terms run from account activation until termination.</li>
          <li><strong>By you:</strong> You may cancel at any time from the Admin dashboard. Cancellation takes effect at the end of the current billing period; no further charges apply.</li>
          <li><strong>By us:</strong> We may suspend or terminate your account immediately if:
            <ul className={UL + ' mt-2'}>
              <li>You breach these Terms (especially Section 6) and do not cure within <strong>7 days</strong> of notice.</li>
              <li>You fail to pay invoices for more than <strong>30 days</strong>.</li>
              <li>Your continued use exposes us to legal liability.</li>
              <li>You become insolvent, bankrupt, or cease operations.</li>
            </ul>
          </li>
          <li><strong>Effect of termination:</strong>
            <ul className={UL + ' mt-2'}>
              <li>Your access is revoked.</li>
              <li>We retain your data for the periods set out in the Privacy Policy (Section 6) for legal-record compliance.</li>
              <li>You may export your data for <strong>30 days</strong> after termination, after which it may be purged except for legally required records.</li>
              <li>Pro-rated refunds of prepaid fees, if any, are at our discretion.</li>
            </ul>
          </li>
        </ol>

        {/* 14. Disclaimers */}
        <h2 className={H2}>14. Disclaimers</h2>
        <ol className={OL}>
          <li>The Service is provided <strong>"as is"</strong> and <strong>"as available"</strong>. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.</li>
          <li>We do not warrant that the Service will be error-free, uninterrupted, or that all data will be recovered in the event of loss.</li>
          <li>We are not a tax advisor, accountant, or legal counsel. Bills, GST calculations, payroll outputs, and reports generated by the Service are tools; you must validate them with a qualified professional before filing.</li>
          <li>Any third-party integrations (Razorpay, Firebase, Cloudinary, Sentry, Google Fonts) are governed by their own terms; we are not responsible for their acts or omissions.</li>
        </ol>

        {/* 15. Liability */}
        <h2 className={H2}>15. Limitation of liability</h2>
        <ol className={OL}>
          <li>To the maximum extent permitted by law, our aggregate liability for all claims arising out of or relating to the Service shall not exceed the <strong>amount paid by you to us in the 12 months preceding the claim</strong>.</li>
          <li>In no event shall we be liable for:
            <ul className={UL + ' mt-2'}>
              <li>Indirect, incidental, special, consequential, or punitive damages.</li>
              <li>Loss of profits, revenue, business, goodwill, or data.</li>
              <li>Downtime, lost orders, or printer failures caused by misconfiguration or third-party hardware.</li>
              <li>Any action or inaction of a third-party processor.</li>
            </ul>
          </li>
          <li>Nothing in these Terms limits liability that cannot be limited under Indian law (e.g. gross negligence, wilful misconduct, or statutory liability).</li>
        </ol>

        {/* 16. Indemnity */}
        <h2 className={H2}>16. Indemnity</h2>
        <p className={P}>
          You agree to indemnify and hold harmless Vtechnologies, its founders, employees,
          and affiliates from any claim, loss, or damage arising from:
        </p>
        <ul className={UL}>
          <li>Your breach of these Terms.</li>
          <li>Your Authorised Users' acts or omissions.</li>
          <li>Inaccurate data you enter (especially GSTIN, FSSAI, prices, payroll).</li>
          <li>Your violation of any law, including the DPDP Act, in relation to data you process through the Service.</li>
          <li>Claims by your staff or End-Customers regarding their personal data.</li>
        </ul>

        {/* 17. Governing law */}
        <h2 className={H2}>17. Governing law and dispute resolution</h2>
        <ol className={OL}>
          <li>These Terms are governed by the laws of <strong>India</strong>.</li>
          <li>The courts at <strong>[Ongole / Prakasam District, Andhra Pradesh]</strong> (or such other place where Vtechnologies is registered) shall have exclusive jurisdiction, subject to the Consumer Protection Act, 2019.</li>
          <li>The parties shall first attempt to resolve any dispute amicably within <strong>30 days</strong> through written notice. If unresolved, the dispute shall be referred to <strong>mediation</strong> under the Mediation Act, 2023, and failing settlement, to arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed by Vtechnologies. The seat and venue of arbitration shall be <strong>[Ongole / Hyderabad]</strong>. The language of arbitration shall be English.</li>
        </ol>

        {/* 18. Changes */}
        <h2 className={H2}>18. Changes to these Terms</h2>
        <p className={P}>
          We may update these Terms from time to time. We will notify Customers by email and
          via an in-app banner of any material change at least <strong>14 days</strong>
          before it takes effect. Continued use after the effective date constitutes
          acceptance. Material changes to fees (Section 4.7) require 30 days' notice.
        </p>

        {/* 19. Severability */}
        <h2 className={H2}>19. Severability</h2>
        <p className={P}>
          If any provision is found unenforceable, the remaining provisions remain in full
          force.
        </p>

        {/* 20. Entire agreement */}
        <h2 className={H2}>20. Entire agreement</h2>
        <p className={P}>
          These Terms, together with the Privacy Policy and any signed order form or DPA,
          constitute the entire agreement between you and Vtechnologies regarding the
          Service.
        </p>

        {/* 21. Contact */}
        <h2 className={H2}>21. Contact</h2>
        <div className={CALLOUT}>
          <p className="flex items-center gap-2 mb-1">
            <Mail size={14} className="text-[#E53935]" />
            <a href="mailto:softshapeai@gmail.com" className="text-[#E53935] hover:underline">softshapeai@gmail.com</a>
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
          <Link to="/privacy" className="text-[#E53935] hover:underline">Privacy Policy</Link>
          {' · '}
          <Link to="/" className="text-gray-500 hover:underline">Softshape.ai</Link>
        </p>
      </article>
    </div>
  );
};

export default TermsPage;
