import { useEffect, useState } from 'react';
import { App, Button, Divider, Dropdown, Form, Input, Modal, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  SignInIcon, SignOutIcon, AccountIcon, PasskeyIcon, GoogleIcon, MailIcon,
} from '../icons';
import { cloudEnabled } from './config';
import {
  getSession, onAuthChange, signInWithOAuth, signInWithPasskey, createAccountWithPasskey,
  registerPasskey, addBackupEmail, sendMagicLink, signInWithPassword, signUpWithPassword,
  signOut, type Session, type OAuthProvider,
} from './auth';
import { takeOAuthError } from './oauthError';

// The sign-in / account control in the top bar. Renders nothing when cloud is
// disabled, so a build without Supabase env vars is exactly the local-only app.
export function AuthMenu() {
  if (!cloudEnabled) return null;
  return <AuthControl />;
}

type Step = 'choose' | 'backup';

function AuthControl() {
  const { message } = App.useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [backup, setBackup] = useState('');
  const [form] = Form.useForm<{ email: string; password: string }>();

  useEffect(() => {
    let active = true;
    getSession().then((s) => { if (active) setSession(s); });
    const off = onAuthChange((s) => setSession(s));
    return () => { active = false; off(); };
  }, []);

  // Surface an OAuth error the provider/Supabase appended to the callback URL,
  // so a failed sign-in shows the real reason instead of silently signing out.
  useEffect(() => {
    const e = takeOAuthError();
    if (e) message.error(`Sign-in failed: ${e}`);
  }, [message]);

  // Run an async action with a busy flag and uniform error surfacing.
  const run = async (label: string, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    try { await fn(); return true; }
    catch (e) { message.error((e as Error).message || `${label} failed`); return false; }
    finally { setBusy(false); }
  };

  const oauth = (provider: OAuthProvider, label: string) =>
    run(label, () => signInWithOAuth(provider)); // navigates away on success

  const passkeyIn = () => run('Passkey sign-in', async () => {
    await signInWithPasskey();
    setOpen(false);
    message.success('Signed in.');
  });

  const passkeyCreate = async () => {
    const ok = await run('Create account', createAccountWithPasskey);
    if (ok) { setStep('backup'); message.success('Passkey saved. Add a backup email so you never get locked out.'); }
  };

  const emailSubmit = () => form.validateFields().then((v) =>
    run(mode === 'in' ? 'Sign in' : 'Sign up', async () => {
      if (mode === 'in') { await signInWithPassword(v.email, v.password); setOpen(false); }
      else { await signUpWithPassword(v.email, v.password); setOpen(false); message.success('Check your email to confirm your account.'); }
    }),
  ).catch(() => { /* inline validation errors are shown by the form */ });

  const magicLink = () => form.validateFields(['email']).then((v) =>
    run('Magic link', async () => { await sendMagicLink(v.email); message.success('Sign-in link sent — check your email.'); }),
  ).catch(() => {});

  const saveBackup = () => run('Save backup email', async () => {
    await addBackupEmail(backup.trim());
    setOpen(false); setStep('choose'); setBackup('');
    message.success('Confirmation link sent — open it to finish adding your backup email.');
  });

  const enrollPasskey = () => run('Passkey setup', async () => {
    await registerPasskey();
    message.success('Passkey saved — use it to sign in next time.');
  });

  const openSignIn = () => { setStep('choose'); setMode('in'); setOpen(true); };
  const openBackup = () => { setStep('backup'); setOpen(true); };

  // ---- signed in -----------------------------------------------------------
  if (session) {
    const email = session.user.email;
    const items: MenuProps['items'] = [
      { key: 'who', label: email ?? 'Passkey account', disabled: true },
      { type: 'divider' },
    ];
    if (!email) items.push({ key: 'backup', icon: <MailIcon />, label: 'Add backup email' });
    items.push({ key: 'passkey', icon: <PasskeyIcon />, label: 'Set up a passkey' });
    items.push({ key: 'out', icon: <SignOutIcon />, label: 'Sign out' });
    return (
      <Dropdown
        trigger={['click']}
        menu={{
          items,
          onClick: ({ key }) => {
            if (key === 'backup') openBackup();
            else if (key === 'passkey') void enrollPasskey();
            else if (key === 'out') void run('Sign out', signOut);
          },
        }}
      >
        <Button icon={<AccountIcon />}>{email ? 'Account' : 'Finish setup'}</Button>
      </Dropdown>
    );
  }

  // ---- signed out ----------------------------------------------------------
  return (
    <>
      <Button icon={<SignInIcon />} onClick={openSignIn}>Sign in</Button>
      <Modal
        title={step === 'backup' ? 'Add a backup email' : 'Sign in to threadwick'}
        open={open} footer={null} onCancel={() => setOpen(false)} destroyOnHidden
      >
        {step === 'backup' ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Typography.Text type="secondary">
              So you can still sign in with an email link if a passkey isn’t available on your device.
            </Typography.Text>
            <Input
              type="email" prefix={<MailIcon />} placeholder="you@example.com"
              value={backup} onChange={(e) => setBackup(e.target.value)} autoComplete="email"
            />
            <Space>
              <Button type="primary" loading={busy} disabled={!backup.trim()} onClick={saveBackup}>Save backup email</Button>
              <Button type="text" onClick={() => setOpen(false)}>Skip for now</Button>
            </Space>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block type="primary" icon={<PasskeyIcon />} loading={busy} onClick={passkeyCreate}>
                Create an account with a passkey
              </Button>
              <Button block icon={<PasskeyIcon />} loading={busy} onClick={passkeyIn}>
                Sign in with a passkey
              </Button>
            </Space>
            <Divider plain style={{ margin: '2px 0' }}>or continue with</Divider>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block loading={busy} onClick={() => oauth('ravelry', 'Ravelry sign-in')}>Ravelry</Button>
              <Button block icon={<GoogleIcon />} loading={busy} onClick={() => oauth('google', 'Google sign-in')}>Google</Button>
            </Space>
            <Divider plain style={{ margin: '2px 0' }}>or use email</Divider>
            <Form form={form} layout="vertical" requiredMark={false} onFinish={emailSubmit}>
              <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]} style={{ marginBottom: 12 }}>
                <Input prefix={<MailIcon />} placeholder="you@example.com" autoComplete="email" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]} style={{ marginBottom: 12 }}>
                <Input.Password placeholder="Password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</Button>
                <Button type="text" onClick={magicLink} loading={busy}>Email me a link</Button>
              </Space>
            </Form>
            <div style={{ textAlign: 'center' }}>
              <Button type="link" size="small" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
                {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </Button>
            </div>
          </Space>
        )}
      </Modal>
    </>
  );
}
