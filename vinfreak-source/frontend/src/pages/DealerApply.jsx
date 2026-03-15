import { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getDealerships, postJSON } from "../api";
import { SettingsContext } from "../App";
import { useToast } from "../ToastContext";
import { useSeo } from "../utils/seo";

const initialForm = {
  dealershipName: "",
  email: "",
  password: "",
  passwordConfirm: "",
  contactEmail: "",
  phone: "",
  website: "",
  location: "",
  requestedDealershipId: "",
};

export default function DealerApply() {
  const settings = useContext(SettingsContext);
  const siteTitle = settings?.site_title || "VINFREAK";
  const { addToast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState([]);
  const [dealerships, setDealerships] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loginUrl = useMemo(() => {
    const configured = settings?.dealer_login_url;
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
    return "https://admin.vinfreak.com/dealership/login";
  }, [settings?.dealer_login_url]);

  useSeo({
    title: `Dealer Application | ${siteTitle}`,
    description:
      `Apply to become a verified dealership partner on ${siteTitle} and publish inventory for enthusiast buyers.`,
    canonicalPath: "/dealership/apply",
    ogType: "website",
    image: "https://cdn.vinfreak.com/branding/QtLmCMtkDhlgVV20aMm8rA.jpg",
    imageAlt: `${siteTitle} logo`,
    siteName: siteTitle,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `Dealer Application | ${siteTitle}`,
      url: "https://vinfreak.com/dealership/apply",
      description:
        "Apply for dealership access to publish inventory, manage listings, and reach enthusiast buyers.",
    },
  });

  useEffect(() => {
    let active = true;
    setLoadingDealers(true);
    (async () => {
      try {
        const dealerData = await getDealerships();
        if (!active) return;
        const list = Array.isArray(dealerData)
          ? dealerData
          : dealerData?.items || dealerData?.results || [];
        setDealerships(
          list.filter((dealer) => dealer && typeof dealer === "object")
        );
      } catch (error) {
        if (active) {
          addToast("Unable to load dealerships list", "error");
        }
      } finally {
        if (active) setLoadingDealers(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [addToast]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const nextErrors = [];
    if (!form.dealershipName.trim()) {
      nextErrors.push("Dealership name is required.");
    }
    if (!form.email.trim()) {
      nextErrors.push("Login email is required.");
    }
    if (!form.password || form.password.length < 8) {
      nextErrors.push("Password must be at least 8 characters.");
    }
    if (form.password !== form.passwordConfirm) {
      nextErrors.push("Passwords do not match.");
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors([]);
    try {
      const payload = {
        dealership_name: form.dealershipName.trim(),
        email: form.email.trim(),
        password: form.password,
        password_confirm: form.passwordConfirm,
        contact_email: form.contactEmail.trim() || undefined,
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        location: form.location.trim() || undefined,
        requested_dealership_id: form.requestedDealershipId
          ? Number(form.requestedDealershipId)
          : undefined,
      };
      const response = await postJSON("/dealership/apply", payload);
      if (response?.ok) {
        setSubmitted(true);
        setForm(initialForm);
        addToast(response?.message || "Application submitted", "success");
      } else if (response?.errors?.length) {
        setErrors(response.errors);
      } else {
        addToast("Application could not be submitted", "error");
      }
    } catch (error) {
      addToast(String(error), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dealer-apply">
      <section className="hero dealer-apply__hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow">Dealer Application</span>
            <h1>Join VINFREAK as a dealership partner</h1>
            <p className="sub">
              Verified dealers get a dedicated portal, curated placement, and
              marketplace trust signals.
            </p>
          </div>
          <div className="dealer-apply__hero-card">
            <div>
              <span className="hero-card-label">Fast approval</span>
              <p className="dealer-apply__hero-copy">
                Most applications are reviewed within 24-48 hours. We will email
                you when your portal is ready.
              </p>
            </div>
            <Link className="btn ghost dealer-apply__login" to="/">
              Return to inventory
            </Link>
          </div>
        </div>
      </section>

      <section className="dealer-apply__panel">
        <header className="dealer-apply__panel-header">
          <div>
            <h2>Dealership details</h2>
            <p className="sub">
              Tell us who you are so we can verify your inventory.
            </p>
          </div>
          <a className="dealer-apply__login-link" href={loginUrl}>
            Already approved? Dealer login
          </a>
        </header>

        {errors.length > 0 && (
          <div className="dealer-apply__errors" role="alert">
            <ul>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {submitted && (
          <div className="dealer-apply__success">
            Application received. We will reach out with approval details soon.
          </div>
        )}

        <form className="dealer-apply__form" onSubmit={handleSubmit}>
          <div className="dealer-apply__grid">
            <label className="dealer-apply__field">
              <span>Dealership name *</span>
              <input
                type="text"
                name="dealershipName"
                value={form.dealershipName}
                onChange={handleChange}
                required
              />
            </label>
            <label className="dealer-apply__field">
              <span>Login email *</span>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="username"
              />
            </label>
            <label className="dealer-apply__field">
              <span>Contact email</span>
              <input
                type="email"
                name="contactEmail"
                value={form.contactEmail}
                onChange={handleChange}
              />
            </label>
            <label className="dealer-apply__field">
              <span>Phone</span>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
              />
            </label>
            <label className="dealer-apply__field">
              <span>Website</span>
              <input
                type="url"
                name="website"
                placeholder="https://"
                value={form.website}
                onChange={handleChange}
              />
            </label>
            <label className="dealer-apply__field">
              <span>Location</span>
              <input
                type="text"
                name="location"
                placeholder="City, ST"
                value={form.location}
                onChange={handleChange}
              />
            </label>
            <label className="dealer-apply__field">
              <span>Already listed on VINFREAK?</span>
              <select
                name="requestedDealershipId"
                value={form.requestedDealershipId}
                onChange={handleChange}
                disabled={loadingDealers}
              >
                <option value="">No, this is a new dealership</option>
                {dealerships.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="dealer-apply__field">
              <span>Password *</span>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
            </label>
            <label className="dealer-apply__field">
              <span>Confirm password *</span>
              <input
                type="password"
                name="passwordConfirm"
                value={form.passwordConfirm}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="dealer-apply__actions">
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit application"}
            </button>
            <a className="btn ghost" href={loginUrl}>
              Dealer login
            </a>
          </div>
        </form>
      </section>
    </div>
  );
}
