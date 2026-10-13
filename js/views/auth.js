import { sb } from '../supabase.js';
import { h, toast, modal, errMsg } from '../ui.js';
import { T } from '../i18n.js';

const baseUrl = () => location.origin + location.pathname;

export function renderAuth(root, { joining = false } = {}) {
  const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: T('密码（至少 6 位）', 'Password (6+ characters)') });
  const msg = h('p', { class: 'auth-msg', role: 'status' });
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };
  const need = (withPass) => {
    if (!email.value.trim()) { say(T('请填写邮箱', 'Enter your email'), true); email.focus(); return false; }
    if (withPass && pass.value.length < 6) { say(T('密码至少 6 位', 'Password must be at least 6 characters'), true); pass.focus(); return false; }
    return true;
  };
  async function run(btn, fn) { btn.disabled = true; try { await fn(); } catch (e) { say(errMsg(e), true); } finally { btn.disabled = false; } }

  const signIn = h('button', { class: 'btn primary', type: 'submit' }, T('登录', 'Sign in'));
  const signUp = h('button', { class: 'btn ghost', type: 'button' }, T('注册新账号', 'Create account'));
  const magic = h('button', { class: 'link', type: 'button' }, T('用邮件里的链接登录', 'Email me a sign-in link'));
  const forgot = h('button', { class: 'link', type: 'button' }, T('忘记密码', 'Forgot password'));
  const setPw = h('button', { class: 'btn ghost small', type: 'button' }, T('通过邮件设置密码', 'Set a password by email'));
  const note = h('div', { class: 'auth-note' },
    h('p', {}, h('strong', {}, T('已有「抱佛脚」账号？', 'Already use 抱佛脚 (Save Deadlines)?')), ' ',
      T('两边共用同一个账号，不需要重新注册。如果你还没设置过密码，在上方填好邮箱后点下面的按钮，再点击邮件里的链接就能设置密码。', 'Both apps share one account, so there is no need to sign up again. If you have never set a password, enter your email above, click the button below, then follow the link in the email.')),
    setPw);

  const form = h('form', { class: 'auth-form', novalidate: true },
    h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, T('邮箱', 'Email')), email),
    h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, T('密码', 'Password')), pass),
    h('div', { class: 'row' }, signIn, signUp),
    h('div', { class: 'row small' }, magic, forgot),
    msg,
    note);
  form.addEventListener('submit', (e) => { e.preventDefault(); if (!need(true)) return; run(signIn, async () => {
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) throw error;
  }); });
  signUp.addEventListener('click', () => { if (!need(true)) return; run(signUp, async () => {
    const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: pass.value, options: { emailRedirectTo: baseUrl() } });
    if (error) throw error;
    if (!data.session) say(T('验证邮件已发出，点击邮件里的链接后就能登录。', 'Check your inbox and click the link to confirm your account.'));
  }); });
  magic.addEventListener('click', () => { if (!need(false)) return; run(magic, async () => {
    const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: baseUrl(), shouldCreateUser: true } });
    if (error) throw error;
    say(T('登录链接已发到你的邮箱。请用同一台设备打开。', 'A sign-in link is on its way. Open it on this device.'));
  }); });
  setPw.addEventListener('click', () => { if (!need(false)) return; run(setPw, async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: baseUrl() });
    if (error) throw error;
    say(T('设置密码的邮件已发出。点击邮件里的链接回到这里，就会出现设置密码的窗口。', 'Email sent. Open the link in it to come back here and set your password.'));
  }); });
  forgot.addEventListener('click', () => { if (!need(false)) return; run(forgot, async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: baseUrl() });
    if (error) throw error;
    say(T('重设密码的邮件已发出。', 'Password reset email sent.'));
  }); });

  root.append(h('section', { class: 'auth' },
    h('div', { class: 'auth-intro' },
      h('h1', { class: 'display' }, 'LexiCraft'),
      h('p', { class: 'lede' }, T('背单词，也造词典。', 'Learn words. Build dictionaries.')),
      h('p', { class: 'muted' }, joining
        ? T('登录后就能加入朋友分享给你的项目。', 'Sign in to join the project you were invited to.')
        : T('自定义闪卡的面数，按语言分项目整理；也能为自创语言编写可查阅、可多人协作的词典。', 'Flashcards with as many faces as you need, organised by language, plus collaborative dictionaries for constructed languages.'))),
    form));
  setTimeout(() => email.focus(), 30);
}

export function openRecovery() {
  const pass = h('input', { type: 'password', autocomplete: 'new-password', placeholder: T('至少 6 位', '6+ characters') });
  modal({
    title: T('设置密码', 'Set your password'),
    body: h('div', { class: 'form' }, h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, T('密码', 'Password')), pass)),
    actions: [{ label: T('保存', 'Save'), kind: 'primary', onClick: async (close) => {
      if (pass.value.length < 6) { toast(T('密码至少 6 位', 'Password must be at least 6 characters')); return; }
      const { error } = await sb.auth.updateUser({ password: pass.value });
      if (error) throw error;
      toast(T('密码已设置，以后可以用邮箱和密码登录', 'Password set. You can now sign in with email and password.'), 4000); close();
    } }],
  });
}
