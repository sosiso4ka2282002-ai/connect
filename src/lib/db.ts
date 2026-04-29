import Dexie, { type Table } from 'dexie';

/* ── Типы ── */

export type Note = {
	id: string;
	title: string;
	contentMd: string;
	updatedAt: number;
	createdAt: number;
	folderId?: string | null;
};

export type LocalUser = {
	id: string;
	email: string;
	passwordHash: string;
	firstName: string;
	lastName: string;
	createdAt: number;
};

export type LocalProfile = {
	id: string;          // совпадает с LocalUser.id
	email: string;
	firstName: string;
	lastName: string;
	avatarUrl: string | null;
	encSalt: string | null;
	masterKeyEnc: string | null;
};

export type LocalNote = {
	id: string;
	userId: string;
	title: string;
	content: string;
	updatedAt: string;   // ISO-строка
	isFavorite: boolean;
};

/* ── БД ── */

class ObsidianDB extends Dexie {
	notes!: Table<Note, string>;
	users!: Table<LocalUser, string>;
	profiles!: Table<LocalProfile, string>;
	userNotes!: Table<LocalNote, string>;

	constructor() {
		super('obsidianOnline');

		this.version(1).stores({
			notes: 'id, updatedAt, createdAt',
		});

		this.version(2).stores({
			notes: 'id, updatedAt, createdAt',
			users: 'id, &email',
			profiles: 'id',
			userNotes: 'id, userId, updatedAt',
		});
	}
}

export const db = new ObsidianDB();

/* ── CRUD для старых заметок (Dexie «notes») ── */

export async function createNote(params: {
	title?: string;
	contentMd?: string;
	folderId?: string | null;
}): Promise<Note> {
	const now = Date.now();
	const id = crypto.randomUUID();
	const note: Note = {
		id,
		title: params.title ?? 'New note',
		contentMd: params.contentMd ?? '',
		folderId: params.folderId ?? null,
		createdAt: now,
		updatedAt: now,
	};
	await db.notes.add(note);
	return note;
}

export async function getNotesByOwner(_ignored: string, max = 100): Promise<Note[]> {
	return db.notes.orderBy('updatedAt').reverse().limit(max).toArray();
}

export async function getAllNotes(max = 100): Promise<Note[]> {
	return db.notes.orderBy('updatedAt').reverse().limit(max).toArray();
}

export async function getNote(noteId: string): Promise<Note | null> {
	const n = await db.notes.get(noteId);
	return n ?? null;
}

export async function updateNote(
	noteId: string,
	updates: Partial<Pick<Note, 'title' | 'contentMd' | 'folderId'>>,
): Promise<void> {
	await db.notes.update(noteId, { ...updates, updatedAt: Date.now() });
}

export async function deleteNote(noteId: string): Promise<void> {
	await db.notes.delete(noteId);
}

/* ── Хеширование пароля (SHA-256, достаточно для локальной демки) ── */

export async function hashPassword(password: string): Promise<string> {
	const buf = new TextEncoder().encode(password);
	const hash = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/* ── CRUD для users ── */

export async function createUser(email: string, password: string, firstName: string, lastName: string): Promise<LocalUser> {
	const existing = await db.users.where('email').equals(email).first();
	if (existing) throw new Error('Пользователь с такой почтой уже существует');
	const id = crypto.randomUUID();
	const passwordHash = await hashPassword(password);
	const user: LocalUser = { id, email, passwordHash, firstName, lastName, createdAt: Date.now() };
	await db.users.add(user);
	return user;
}

export async function getUserByEmail(email: string): Promise<LocalUser | undefined> {
	return db.users.where('email').equals(email).first();
}

export async function getUserById(id: string): Promise<LocalUser | undefined> {
	return db.users.get(id);
}

/* ── CRUD для profiles ── */

export async function upsertProfile(profile: LocalProfile): Promise<void> {
	await db.profiles.put(profile);
}

export async function getProfile(userId: string): Promise<LocalProfile | undefined> {
	return db.profiles.get(userId);
}

export async function updateProfile(userId: string, updates: Partial<Omit<LocalProfile, 'id'>>): Promise<void> {
	await db.profiles.update(userId, updates);
}

/* ── CRUD для userNotes ── */

export async function getUserNotes(userId: string): Promise<LocalNote[]> {
	return db.userNotes.where('userId').equals(userId).sortBy('updatedAt').then(arr => arr.reverse());
}

export async function getUserNote(noteId: string): Promise<LocalNote | undefined> {
	return db.userNotes.get(noteId);
}

export async function insertUserNote(note: LocalNote): Promise<void> {
	await db.userNotes.add(note);
}

export async function updateUserNote(noteId: string, updates: Partial<Omit<LocalNote, 'id'>>): Promise<void> {
	await db.userNotes.update(noteId, updates);
}

export async function deleteUserNote(noteId: string): Promise<void> {
	await db.userNotes.delete(noteId);
}


