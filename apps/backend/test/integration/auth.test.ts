import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  API,
  PASSWORD,
  app,
  as,
  prisma,
  registerStudent,
  registerTeacher,
  resetDb,
} from '../support/api';

beforeEach(resetDb);

describe('registration', () => {
  it('requires the teacher code for teacher accounts', async () => {
    const res = await request(app).post(`${API}/auth/register`).send({
      role: 'TEACHER',
      email: 'x@test.local',
      password: PASSWORD,
      firstName: 'X',
      lastName: 'Y',
      teacherCode: 'wrong-code',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_TEACHER_CODE');
  });

  it('stores an Argon2id hash, never the password', async () => {
    const s = await registerStudent();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects duplicate email and student number with specific codes', async () => {
    const s = await registerStudent({ email: 'dup@test.local', studentNumber: 'DUP-1' });
    expect(s.userId).toBeTruthy();

    const email = await request(app).post(`${API}/auth/register`).send({
      role: 'STUDENT',
      email: 'DUP@test.local',
      password: PASSWORD,
      firstName: 'A',
      lastName: 'B',
      studentNumber: 'OTHER-1',
    });
    expect(email.status).toBe(409);
    expect(email.body.error.code).toBe('EMAIL_TAKEN');

    const number = await request(app).post(`${API}/auth/register`).send({
      role: 'STUDENT',
      email: 'other@test.local',
      password: PASSWORD,
      firstName: 'A',
      lastName: 'B',
      studentNumber: 'DUP-1',
    });
    expect(number.status).toBe(409);
    expect(number.body.error.code).toBe('STUDENT_NUMBER_TAKEN');
  });

  it('validates input', async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ role: 'STUDENT', email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('login and tokens', () => {
  it('logs in with a generic error for bad credentials', async () => {
    await registerTeacher({ email: 'login@test.local' });
    const wrong = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'login@test.local', password: 'nope-nope' });
    const unknown = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'ghost@test.local', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);

    const ok = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'LOGIN@test.local', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.role).toBe('TEACHER');
  });

  it('returns the profile from /auth/me', async () => {
    const s = await registerStudent({ firstName: 'Lia' });
    const me = await as(s.token).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('STUDENT');
    expect(me.body.data.profile.firstName).toBe('Lia');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const s = await registerStudent();
    const first = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: s.refreshToken });
    expect(first.status).toBe(200);
    const rotated = first.body.data.refreshToken as string;
    expect(rotated).not.toBe(s.refreshToken);

    // Replaying the old token is treated as theft: the whole family is revoked.
    const replay = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: s.refreshToken });
    expect(replay.status).toBe(401);
    const afterReplay = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: rotated });
    expect(afterReplay.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const s = await registerStudent();
    expect((await as(s.token).post('/auth/logout', { refreshToken: s.refreshToken })).status).toBe(
      204,
    );
    const res = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(401);
  });

  it('changing the password signs out other devices', async () => {
    const s = await registerTeacher();
    const res = await as(s.token).patch('/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-pass',
    });
    expect(res.status).toBe(204);
    const refresh = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: s.refreshToken });
    expect(refresh.status).toBe(401);
    const audit = await prisma.auditLog.count({
      where: { userId: s.userId, action: 'PASSWORD_CHANGED' },
    });
    expect(audit).toBe(1);
  });

  it('blocks deactivated accounts immediately', async () => {
    const s = await registerStudent();
    await prisma.user.update({ where: { id: s.userId }, data: { isActive: false } });
    const res = await as(s.token).get('/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});
