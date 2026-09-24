import { useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  type AdminUser,
  type CreateAdminUser,
} from "../features/billing/billingApi";
import { LoadingOrError, PageTitle } from "./AdminShared";

const initialUser: CreateAdminUser = {
  email: "",
  password: "",
  name: "",
  dateOfBirth: "",
  phone: "",
  organization: "",
  role: "user",
  status: "ACTIVE",
  plan: "free",
  limitUnits: 1000,
};

export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"" | AdminUser["role"]>("");
  const [status, setStatus] = useState<"" | AdminUser["status"]>("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const reload = async () => {
    setLoading(true);
    try {
      setUsers(await fetchAdminUsers());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    void fetchAdminUsers()
      .then((value) => {
        if (active) {
          setUsers(value);
          setError(false);
        }
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(i18n.language);
    return users.filter(
      (user) =>
        (!normalized ||
          `${user.name} ${user.email}`.toLocaleLowerCase(i18n.language).includes(normalized)) &&
        (!role || user.role === role) &&
        (!status || user.status === status)
    );
  }, [i18n.language, query, role, status, users]);
  const visibleUsers = filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const updateFilter = (callback: () => void) => {
    callback();
    setPage(0);
  };
  const remove = async (user: AdminUser) => {
    if (!window.confirm(t("admin.deleteConfirm", { email: user.email }))) return;
    try {
      await deleteAdminUser(user.id);
      await reload();
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <PageTitle
        title={t("admin.userManagement")}
        description={t("admin.usersDescription")}
        action={
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreating(true)}
          >
            {t("admin.addUser")}
          </Button>
        }
      />
      <LoadingOrError loading={loading} error={error} />
      {!loading && (
        <Paper sx={{ borderRadius: 3, overflow: "hidden", border: "1px solid rgba(224,0,43,.14)" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ p: 2 }}>
            <TextField
              value={query}
              onChange={(event) => updateFilter(() => setQuery(event.target.value))}
              label={t("admin.searchUsers")}
              size="small"
              fullWidth
            />
            <TextField
              select
              label={t("admin.role")}
              value={role}
              size="small"
              sx={{ minWidth: 150 }}
              onChange={(event) =>
                updateFilter(() => setRole(event.target.value as "" | AdminUser["role"]))
              }
            >
              <MenuItem value="">{t("admin.allRoles")}</MenuItem>
              <MenuItem value="user">{t("admin.user")}</MenuItem>
              <MenuItem value="admin">{t("admin.administrator")}</MenuItem>
            </TextField>
            <TextField
              select
              label={t("admin.status")}
              value={status}
              size="small"
              sx={{ minWidth: 160 }}
              onChange={(event) =>
                updateFilter(() => setStatus(event.target.value as "" | AdminUser["status"]))
              }
            >
              <MenuItem value="">{t("admin.allStatuses")}</MenuItem>
              <MenuItem value="ACTIVE">{t("admin.active")}</MenuItem>
              <MenuItem value="DISABLED">{t("admin.disabled")}</MenuItem>
              <MenuItem value="LOCKED">{t("admin.locked")}</MenuItem>
            </TextField>
          </Stack>
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: "rgba(224,0,43,.08)" }}>
                <TableRow>
                  <TableCell>{t("admin.account")}</TableCell>
                  <TableCell>{t("admin.role")}</TableCell>
                  <TableCell>{t("admin.status")}</TableCell>
                  <TableCell>
                    {t("admin.plan")} / {t("admin.quota")}
                  </TableCell>
                  <TableCell>{t("admin.online")}</TableCell>
                  <TableCell>{t("admin.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleUsers.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{user.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {user.role === "admin" ? t("admin.administrator") : t("admin.user")}
                    </TableCell>
                    <TableCell>
                      {user.status === "ACTIVE"
                        ? t("admin.active")
                        : user.status === "DISABLED"
                          ? t("admin.disabled")
                          : t("admin.locked")}
                    </TableCell>
                    <TableCell>
                      {user.plan} · {user.usedUnits}/{user.limitUnits}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={user.online ? "success.main" : "text.secondary"}
                      >
                        {user.online ? t("admin.online") : t("admin.offline")}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() => setEditing(user)}
                        startIcon={<Pencil size={15} />}
                      >
                        {t("admin.edit")}
                      </Button>
                      <Button
                        size="small"
                        color="secondary"
                        onClick={() => setResetting(user)}
                        startIcon={<KeyRound size={15} />}
                      >
                        {t("admin.resetPassword")}
                      </Button>
                      <Button
                        color="error"
                        size="small"
                        onClick={() => void remove(user)}
                        startIcon={<Trash2 size={15} />}
                      >
                        {t("admin.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {visibleUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary" sx={{ py: 3 }}>
                        {t("admin.noMatchingUsers")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredUsers.length}
            page={page}
            onPageChange={(_, value) => setPage(value)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage={t("admin.rowsPerPage")}
            labelDisplayedRows={({ from, to, count }) =>
              t("admin.displayedRows", { from, to, count })
            }
          />
        </Paper>
      )}
      {(creating || editing) && (
        <UserDialog
          user={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => void reload()}
          onError={() => setError(true)}
        />
      )}
      {resetting && (
        <PasswordResetDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => void reload()}
          onError={() => setError(true)}
        />
      )}
    </>
  );
}

function UserDialog({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateAdminUser>(() =>
    user
      ? {
          ...initialUser,
          email: user.email,
          password: "",
          name: user.name,
          role: user.role,
          status: user.status,
          plan: user.plan,
          limitUnits: user.limitUnits,
        }
      : initialUser
  );
  const set = <K extends keyof CreateAdminUser>(key: K, value: CreateAdminUser[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    try {
      if (user) {
        const update = {
          ...(form.name !== user.name && { name: form.name }),
          ...(form.email !== user.email && { email: form.email }),
          ...(form.role !== user.role && { role: form.role }),
          ...(form.status !== user.status && { status: form.status }),
          ...(form.plan !== user.plan && { plan: form.plan }),
          ...(Number(form.limitUnits) !== user.limitUnits && {
            limitUnits: Number(form.limitUnits),
          }),
        };
        if (Object.keys(update).length) await updateAdminUser(user.id, update);
      } else {
        await createAdminUser({ ...form, limitUnits: Number(form.limitUnits) });
      }
      onClose();
      onSaved();
    } catch {
      onError();
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{user ? t("admin.editUser") : t("admin.addUser")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t("admin.name")}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => set("email", event.target.value)}
            required
          />
          {!user && (
            <TextField
              label={t("admin.password")}
              type="password"
              value={form.password}
              required
              onChange={(event) => set("password", event.target.value)}
              helperText={t("admin.passwordHelp")}
            />
          )}
          {!user && (
            <>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  fullWidth
                  type="date"
                  label={t("admin.dateOfBirth")}
                  value={form.dateOfBirth ?? ""}
                  onChange={(event) => set("dateOfBirth", event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                <TextField
                  fullWidth
                  type="tel"
                  label={t("admin.phone")}
                  value={form.phone ?? ""}
                  onChange={(event) => set("phone", event.target.value)}
                  required
                />
              </Stack>
              <TextField
                label={t("admin.organization")}
                value={form.organization ?? ""}
                onChange={(event) => set("organization", event.target.value)}
                required
              />
            </>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              fullWidth
              label={t("admin.role")}
              value={form.role}
              onChange={(event) => set("role", event.target.value as AdminUser["role"])}
            >
              <MenuItem value="user">{t("admin.user")}</MenuItem>
              <MenuItem value="admin">{t("admin.administrator")}</MenuItem>
            </TextField>
            <TextField
              select
              fullWidth
              label={t("admin.status")}
              value={form.status}
              onChange={(event) => set("status", event.target.value as AdminUser["status"])}
            >
              <MenuItem value="ACTIVE">{t("admin.active")}</MenuItem>
              <MenuItem value="DISABLED">{t("admin.disabled")}</MenuItem>
              <MenuItem value="LOCKED">{t("admin.locked")}</MenuItem>
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              fullWidth
              label={t("admin.plan")}
              value={form.plan}
              onChange={(event) => set("plan", event.target.value)}
            />
            <TextField
              fullWidth
              type="number"
              label={t("admin.quota")}
              value={form.limitUnits}
              onChange={(event) => set("limitUnits", Number(event.target.value))}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose}>{t("admin.cancel")}</Button>
        <Button variant="contained" onClick={() => void save()}>
          {user ? t("admin.saveChanges") : t("admin.createUser")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PasswordResetDialog({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!password || password !== confirmation) {
      setInvalid(true);
      return;
    }
    setSaving(true);
    try {
      await resetAdminUserPassword(user.id, password);
      onClose();
      onSaved();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("admin.resetPassword")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="warning">{t("admin.resetPasswordWarning", { email: user.email })}</Alert>
          <TextField
            label={t("admin.temporaryPassword")}
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(event) => {
              setPassword(event.target.value);
              setInvalid(false);
            }}
            helperText={t("admin.passwordHelp")}
            required
          />
          <TextField
            label={t("admin.confirmTemporaryPassword")}
            type="password"
            value={confirmation}
            autoComplete="new-password"
            error={invalid}
            helperText={invalid ? t("admin.passwordsMismatch") : undefined}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setInvalid(false);
            }}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button disabled={saving} onClick={onClose}>
          {t("admin.cancel")}
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={saving}
          onClick={() => void save()}
          startIcon={<KeyRound size={17} />}
        >
          {t("admin.confirmReset")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
