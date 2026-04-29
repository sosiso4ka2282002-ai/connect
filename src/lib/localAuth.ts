/**
 * Локальная система авторизации (замена Supabase Auth).
 *
 * Хранит текущую сессию в localStorage, а пользователей / профили —
 * в IndexedDB через Dexie (см. db.ts).
 */

import {
	createUser,
	getUserByEmail,
	getUserById,
	hashPassword,
	upsertProfile,
	getProfile,
	updateProfile,
	getUserNotes,
	insertUserNote,
	updateUserNote,
	deleteUserNote,
	type LocalUser,
	type LocalProfile,
	type LocalNote,
} from './db';

const SESSION_KEY = 'local_auth_session';

/* ── Типы ── */

export interface SessionUser {
	id: string;
	email: string;
	user_metadata: { first_name: string; last_name: string };
}

interface Session {
	userId: string;
}

/* ── helpers ── */

function saveSession(userId: string) {
	localStorage.setItem(SESSION_KEY, JSON.stringify({ userId } satisfies Session));
}

function loadSession(): Session | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as Session;
	} catch {
		return null;
	}
}

function clearSession() {
	localStorage.removeItem(SESSION_KEY);
}

/* ── Публичный API (повторяет интерфейс Supabase Auth, чтобы минимально менять компоненты) ── */

export const localAuth = {
	/** Регистрация нового пользователя */
	async signUp(
		email: string,
		password: string,
		meta: { first_name: string; last_name: string },
	): Promise<{ user: SessionUser }> {
		const user = await createUser(email, password, meta.first_name, meta.last_name);
		saveSession(user.id);
		return { user: toSessionUser(user) };
	},

	/** Вход по email + пароль */
	async signInWithPassword(
		email: string,
		password: string,
	): Promise<{ user: SessionUser }> {
		const user = await getUserByEmail(email);
		if (!user) throw new Error('Пользователь не найден');
		const hash = await hashPassword(password);
		if (hash !== user.passwordHash) throw new Error('Неверный пароль');
		saveSession(user.id);
		return { user: toSessionUser(user) };
	},

	/** Получить текущего пользователя (или null) */
	async getUser(): Promise<SessionUser | null> {
		const s = loadSession();
		if (!s) return null;
		const user = await getUserById(s.userId);
		if (!user) { clearSession(); return null; }
		return toSessionUser(user);
	},

	/** Есть ли активная сессия */
	async getSession(): Promise<{ session: boolean }> {
		const s = loadSession();
		if (!s) return { session: false };
		const user = await getUserById(s.userId);
		if (!user) { clearSession(); return { session: false }; }
		return { session: true };
	},

	/** Выход */
	async signOut() {
		clearSession();
	},
};

/* ── Работа с профилями ── */

export const localProfiles = {
	async upsert(profile: LocalProfile) {
		await upsertProfile(profile);
	},

	async get(userId: string): Promise<LocalProfile | null> {
		return (await getProfile(userId)) ?? null;
	},

	async update(userId: string, updates: Partial<Omit<LocalProfile, 'id'>>) {
		await updateProfile(userId, updates);
	},
};

/* ── Работа с заметками пользователя ── */

export const localNotes = {
	async list(userId: string): Promise<LocalNote[]> {
		return getUserNotes(userId);
	},

	async insert(note: LocalNote) {
		await insertUserNote(note);
	},

	async update(noteId: string, updates: Partial<Omit<LocalNote, 'id'>>) {
		await updateUserNote(noteId, updates);
	},

	async delete(noteId: string) {
		await deleteUserNote(noteId);
	},
};

/* ── Вспомогательная конвертация ── */

function toSessionUser(u: LocalUser): SessionUser {
	return {
		id: u.id,
		email: u.email,
		user_metadata: { first_name: u.firstName, last_name: u.lastName },
	};
}
