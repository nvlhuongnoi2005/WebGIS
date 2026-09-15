import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Map, MapPin, Navigation, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../../components/LanguageSwitcher/LanguageSwitcher";
import { useAuth } from "./useAuth";
import "./LoginPage.css";

type AuthMode = "login" | "register";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isRegister && !name.trim()) {
      setError(t("auth.nameRequired"));
      return;
    }

    if (isRegister && !dateOfBirth) {
      setError(t("auth.dateOfBirthRequired"));
      return;
    }

    if (isRegister && !isValidDateOfBirth(dateOfBirth)) {
      setError(t("auth.dateOfBirthInvalid"));
      return;
    }

    if (isRegister && !phone.trim()) {
      setError(t("auth.phoneRequired"));
      return;
    }

    if (isRegister && !isValidPhone(phone)) {
      setError(t("auth.phoneInvalid"));
      return;
    }

    if (isRegister && !organization.trim()) {
      setError(t("auth.organizationRequired"));
      return;
    }

    if (!email.trim()) {
      setError(t("auth.emailRequired"));
      return;
    }

    if (!isValidEmail(email)) {
      setError(t("auth.emailInvalid"));
      return;
    }

    if (password.length < 8) {
      setError(t("auth.passwordLength"));
      return;
    }

    if (!hasPasswordComplexity(password)) {
      setError(t("auth.passwordPolicy"));
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = isRegister
      ? await register({ name, email, password, dateOfBirth, phone, organization })
      : await login(email, password);

    setIsSubmitting(false);
    if (!result.ok) {
      setError(t(`auth.${result.code}`));
      return;
    }

    onAuthenticated();
  };

  return (
    <Box component="main" id="main-content" className="auth-page">
      <Box className="auth-orb auth-orb--one" aria-hidden />
      <Box className="auth-orb auth-orb--two" aria-hidden />
      <Box className="auth-language-switcher">
        <LanguageSwitcher />
      </Box>
      <Container maxWidth="md" disableGutters className="auth-shell">
        <Paper elevation={0} className="auth-card">
          <Box className="auth-showcase">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", position: "relative" }}>
              <Box className="auth-showcase__logo">
                <Map size={26} aria-hidden />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {t("auth.brand")}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.76 }}>
                  {t("auth.subtitle")}
                </Typography>
              </Box>
            </Stack>

            <Box className="auth-map-illustration" aria-hidden>
              <Box className="auth-map-illustration__glow" />
              <svg viewBox="0 0 520 350" focusable="false">
                <path className="auth-map-illustration__route auth-map-illustration__route--soft" d="M12 285C98 270 94 104 190 116s53 150 151 118c88-29 59-155 166-178" />
                <path className="auth-map-illustration__route" d="M24 297C117 283 112 144 199 138s52 129 132 105c76-26 68-139 165-182" />
                <path className="auth-map-illustration__route auth-map-illustration__route--thin" d="M58 69c92 6 82 90 150 96 72 6 100-96 238-89" />
              </svg>
              <Box className="auth-map-pin auth-map-pin--start"><Navigation size={18} fill="currentColor" /></Box>
              <Box className="auth-map-pin auth-map-pin--end"><MapPin size={22} fill="currentColor" /></Box>
              <Box className="auth-map-node auth-map-node--one" />
              <Box className="auth-map-node auth-map-node--two" />
              <Box className="auth-map-node auth-map-node--three" />
              <Box className="auth-map-illustration__caption">10.8231° N&nbsp;&nbsp;•&nbsp;&nbsp;106.6297° E</Box>
            </Box>

            <Stack spacing={1} className="auth-showcase__copy">
              <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.14 }}>
                {t("auth.brand")}
              </Typography>
              <Typography variant="body1" sx={{ maxWidth: 310, opacity: 0.82, lineHeight: 1.65 }}>
                {t("auth.subtitle")}
              </Typography>
            </Stack>
          </Box>

          <Box className={`auth-form auth-form--${mode}`}>
            <Stack direction="row" spacing={1.25} className="auth-form__mobile-brand">
              <Box className="auth-form__mobile-logo"><Map size={21} aria-hidden /></Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{t("auth.brand")}</Typography>
                <Typography variant="caption" color="text.secondary">{t("auth.subtitle")}</Typography>
              </Box>
            </Stack>
            <Tabs
              value={mode}
              onChange={(_, value: AuthMode) => changeMode(value)}
              variant="fullWidth"
              aria-label={t("auth.tabsLabel")}
              className="auth-tabs"
            >
              <Tab value="login" label={t("auth.login")} />
              <Tab value="register" label={t("auth.register")} />
            </Tabs>

            <Stack key={mode} spacing={0.75} className="auth-form__intro">
              <Typography variant="h5" sx={{ fontWeight: 750 }}>
                {t(isRegister ? "auth.registerTitle" : "auth.loginTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(isRegister ? "auth.registerDescription" : "auth.loginDescription")}
              </Typography>
            </Stack>

            <Box component="form" onSubmit={event => void handleSubmit(event)} noValidate className="auth-form__fields">
              <Stack spacing={isRegister ? 1.25 : 2}>
                {isRegister && (
                  <TextField
                    autoComplete="name"
                    label={t("auth.name")}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    required
                    fullWidth
                    autoFocus
                  />
                )}
                {isRegister && (
                  <Box className="auth-form__field-row">
                    <TextField
                      autoComplete="bday"
                      type="date"
                      label={t("auth.dateOfBirth")}
                      value={dateOfBirth}
                      onChange={event => setDateOfBirth(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      required
                      fullWidth
                    />
                    <TextField
                      autoComplete="tel"
                      type="tel"
                      label={t("auth.phone")}
                      value={phone}
                      onChange={event => setPhone(event.target.value)}
                      required
                      fullWidth
                    />
                  </Box>
                )}
                {isRegister && (
                  <TextField
                    autoComplete="organization"
                    label={t("auth.organization")}
                    value={organization}
                    onChange={event => setOrganization(event.target.value)}
                    required
                    fullWidth
                  />
                )}
                <TextField
                  autoComplete="email"
                  label={t("auth.email")}
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  fullWidth
                  autoFocus={!isRegister}
                />
                {isRegister ? (
                  <Box className="auth-form__field-row">
                    <TextField
                      autoComplete="new-password"
                      type="password"
                      label={t("auth.password")}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      required
                      fullWidth
                    />
                    <TextField
                      autoComplete="new-password"
                      type="password"
                      label={t("auth.confirmPassword")}
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      required
                      fullWidth
                    />
                  </Box>
                ) : (
                  <TextField
                    autoComplete="current-password"
                    type="password"
                    label={t("auth.password")}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                    fullWidth
                  />
                )}

                {error && <Alert severity="error">{error}</Alert>}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={isSubmitting}
                  startIcon={<UserRound size={18} />}
                  className="auth-submit"
                >
                  {t(isRegister ? "auth.createAccount" : "auth.login")}
                </Button>
              </Stack>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidDateOfBirth(value: string): boolean {
  const dateOfBirth = new Date(`${value}T00:00:00`);
  return !Number.isNaN(dateOfBirth.getTime()) && dateOfBirth < new Date();
}

function isValidPhone(value: string): boolean {
  return /^\+?\d{8,15}$/.test(value.replace(/[\s().-]/g, ""));
}

function hasPasswordComplexity(value: string): boolean {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}
