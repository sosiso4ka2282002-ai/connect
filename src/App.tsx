import { useCallback, useEffect, useMemo, useState } from 'react';
import { Editor } from './components/Editor';
import { Sidebar, builtInNavItems } from './components/Sidebar';
import type { SidebarFileItem } from './components/Sidebar';
import { FileList } from './components/FileList';
import { StatusBar } from './components/StatusBar';
import { NewNoteModal } from './components/NewNoteModal';
import { Toast } from './components/Toast';
import { TagsModal } from './components/TagsModal';
import { Welcome } from './components/Welcome';
import { SearchOverlay } from './components/SearchOverlay';
import { TagBrowser } from './components/TagBrowser';
import { SettingsModal } from './components/SettingsModal';
import { localAuth, localProfiles, localNotes } from './lib/localAuth';
import { PassphraseModal } from './components/PassphraseModal';
import { getSessionSalt, importKeyFromB64, tryDecryptString, encryptString } from './lib/crypto';
import type { UserSettings } from './components/SettingsModal';

type VaultNote = SidebarFileItem & {
	content: string;
	tags?: string[];
};

const mockFiles: VaultNote[] = [
	{ id: 'daily-note', name: 'Ежедневник.md', updated: 'сегодня', content: '# Добро пожаловать\n' },
	{ id: 'ideas', name: 'Идеи проекта.md', updated: 'вчера', content: '' },
	{ id: 'resources', name: 'Исследование.md', updated: '3 дня назад', content: '' },
	{ id: 'archive', name: 'Архив заметок.md', updated: '7 дней назад', content: '' },
];

export default function App() {
	const [navId, setNavId] = useState('files');
	const [mode, setMode] = useState<'welcome' | 'list' | 'editor' | 'tags' | 'favorites'>('welcome');
	// запоминаем откуда пришли в редактор, чтобы по «Закрыть» вернуться правильно
	const [lastListMode, setLastListMode] = useState<'list' | 'tags' | 'favorites'>('list');
	const [userId, setUserId] = useState<string | null>(null);
	const [notes, setNotes] = useState<Record<string, VaultNote>>(() => {
		try {
			const raw = localStorage.getItem('vaultNotesV1');
			if (raw) {
				const parsed = JSON.parse(raw) as Record<string, VaultNote>;
				return parsed;
			}
		} catch {}
		// fallback на демо-заметки
		return mockFiles.reduce((acc, note) => {
			acc[note.id] = note;
			return acc;
		}, {} as Record<string, VaultNote>);
	});
	const [activeFileId, setActiveFileId] = useState<VaultNote['id']>(() => {
		try {
			const stored = localStorage.getItem('activeFileIdV1');
			if (stored) return stored as VaultNote['id'];
		} catch {}
		return mockFiles[0]?.id ?? '';
	});
	const [cursor, setCursor] = useState({ line: 0, column: 0 });
	const [showCreate, setShowCreate] = useState(false);
	const [toastOpen, setToastOpen] = useState(false);
	const [toastMsg, setToastMsg] = useState('');
	const [showTags, setShowTags] = useState(false);
	const [showSearch, setShowSearch] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [showPassphrase, setShowPassphrase] = useState(false);
	const [encKey, setEncKey] = useState<CryptoKey | null>(null);
	const [settings, setSettings] = useState<UserSettings>(() => {
		try {
			const raw = localStorage.getItem('userSettingsV1');
			if (raw) return JSON.parse(raw) as UserSettings;
		} catch {}
		return {
			firstName: '',
			lastName: '',
			email: 'user@example.com',
			avatarDataUrl: undefined,
			theme: 'dark',
		};
	});
	const [favorites, setFavorites] = useState<Record<string, true>>(() => {
		try {
			const raw = localStorage.getItem('favoritesV1');
			if (raw) return JSON.parse(raw) as Record<string, true>;
		} catch {}
		return {};
	});

	// Применяем тему при изменении настроек (и при первом монтировании)
	useEffect(() => {
		document.body.classList.remove('theme-dark', 'theme-light', 'theme-amoled');
		document.body.classList.add(`theme-${settings.theme}`);
	}, [settings.theme]);

	const files = useMemo(() => Object.values(notes), [notes]);
	const activeNote = notes[activeFileId] ?? files[0] ?? null;
	const editorTitle = 'Локальный Markdown файл';
	const editorSubtitle = activeNote?.name ?? 'Без имени.md';
	const editorContent = activeNote?.content ?? '';
	const editorTags = activeNote?.tags ?? [];

	// Мгновенная синхронизация с localStorage для критичных операций
	const persist = useCallback((next: Record<string, VaultNote>, nextActive?: string) => {
		try {
			localStorage.setItem('vaultNotesV1', JSON.stringify(next));
			if (typeof nextActive === 'string') localStorage.setItem('activeFileIdV1', nextActive);
		} catch {}
	}, []);

	// Требуем авторизацию и подгружаем заметки пользователя
	useEffect(() => {
		(async () => {
			const user = await localAuth.getUser();
			if (!user) {
				window.location.href = '/';
				return;
			}
			setUserId(user.id);
			// профиль
			const prof = await localProfiles.get(user.id);
			if (prof) {
				setSettings((prev) => ({
					...prev,
					email: prof.email || prev.email,
					firstName: prof.firstName || '',
					lastName: prof.lastName || '',
					avatarDataUrl: prof.avatarUrl || prev.avatarDataUrl,
				}));
			}
			const rows = await localNotes.list(user.id);
			if (rows.length > 0) {
				const mapped: Record<string, VaultNote> = {};
				for (const r of rows) {
					let content: string = r.content ?? '';
					if (typeof content === 'string' && content.startsWith('enc:v1:') && encKey) {
						const plain = await tryDecryptString(content, encKey);
						if (plain !== null) content = plain;
					}
					mapped[r.id] = { id: r.id, name: r.title ?? 'Без имени.md', updated: r.updatedAt ?? '—', content };
				}
				setNotes(mapped);
			}
			setMode('welcome');
		})();
	}, [encKey]);

	// Пытаемся восстановить ключ из сессии
	useEffect(() => {
		const keyB64 = sessionStorage.getItem('enc:key');
		if (keyB64) {
			importKeyFromB64(keyB64).then(setEncKey).catch(() => {});
		}
	}, []);

	// Принять демо-параметры из лендинга: /app?demo=1&title=...
	useEffect(() => {
		try {
			const url = new URL(window.location.href);
			if (url.pathname.startsWith('/app')) {
				const isDemo = url.searchParams.get('demo');
				const titleParam = url.searchParams.get('title') || 'Новая заметка';
				if (isDemo) {
					const id = (crypto && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `${Date.now()}-0000-4000-8000-000000000000`;
					const name = titleParam.endsWith('.md') ? titleParam : `${titleParam}.md`;
					const newNote: VaultNote = { id, name, updated: 'только что', content: '', tags: [] };
					setNotes((prev) => {
						const next = { [id]: newNote, ...prev };
						persist(next, id);
						return next;
					});
					setActiveFileId(id);
					setMode('editor');
					setCursor({ line: 0, column: 0 });
					// очистим query
					url.search = '';
					window.history.replaceState({}, '', url.toString());
				}
			}
		} catch {}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleSelectNav = useCallback((id: string) => {
		// Для модальных пунктов не меняем активный раздел в сайдбаре
		if (id === 'search') {
			setShowSearch(true);
			return;
		}
		if (id === 'settings') {
			setShowSettings(true);
			return;
		}
		setNavId(id);
		if (id === 'files') {
			setMode('list');
			setLastListMode('list');
		} else if (id === 'tags') {
			setMode('tags');
			setLastListMode('tags');
		} else if (id === 'favorites') {
			setMode('favorites');
			setLastListMode('favorites');
		} else {
			setMode('editor');
		}
	}, []);

	const handleSelectFile = useCallback(
		(id: string) => {
			setActiveFileId(id);
			const nextNote = notes[id];
			if (nextNote) {
				// запоминаем из какого раздела открыли редактор
				if (mode === 'favorites' || mode === 'tags') {
					setLastListMode(mode);
				} else {
					setLastListMode('list');
				}
				const segments = nextNote.content.split('\n');
				const totalLines = nextNote.content.length === 0 ? 0 : segments.length;
				const lastLine = segments.length > 0 ? segments[segments.length - 1] ?? '' : '';
				setCursor({
					line: totalLines,
					column: totalLines === 0 ? 0 : lastLine.length + 1,
				});
				setMode('editor');
				// в сайдбаре оставляем текущий пункт, ничего не меняем
			}
		},
		[notes, mode],
	);

	const handleContentChange = useCallback(
		(nextValue: string) => {
			setNotes((prev) => {
				if (!activeNote) {
					return prev;
				}
				return {
					...prev,
					[activeNote.id]: {
						...activeNote,
						content: nextValue,
					},
				};
			});
		},
		[activeNote],
	);

	const handleSave = useCallback(async () => {
		if (!activeNote) return;
		// если есть ключ — шифруем перед отправкой
		let serverContent = activeNote.content;
		if (encKey) {
			serverContent = await encryptString(activeNote.content, encKey);
		}
		setNotes((prev) => {
			const next = {
				...prev,
				[activeNote.id]: {
					...activeNote,
					updated: 'только что',
				},
			};
			persist(next, activeFileId);
			return next;
		});
		// Сохранить в локальной БД
		if (userId && activeNote) {
			try {
				await localNotes.update(activeNote.id, {
					title: activeNote.name,
					content: serverContent,
					updatedAt: new Date().toISOString(),
				});
			} catch (err) {
				console.warn('notes.update error:', err);
				setToastMsg('Не удалось сохранить');
				setToastOpen(true);
			}
		}
		setToastMsg('Заметка сохранена');
		setToastOpen(true);
	}, [activeNote, activeFileId, persist, userId, encKey]);

	const handleClose = useCallback(() => {
		if (!activeNote) return;
		// Не трогаем содержимое заметки — просто уходим в список
		setCursor({ line: 0, column: 0 });
		// возвращаемся туда, откуда пришли
		setMode(lastListMode);
		setNavId(lastListMode === 'favorites' ? 'favorites' : lastListMode === 'tags' ? 'tags' : 'files');
	}, [activeNote, lastListMode]);

	const handleCursorChange = useCallback((line: number, column: number) => {
		setCursor({ line, column });
	}, []);

	const characterCount = editorContent.length;
	const lineCount = editorContent.length === 0 ? 0 : editorContent.split('\n').length;
	const line = cursor.line > 0 ? cursor.line : lineCount;
	const column = cursor.column > 0 ? cursor.column : 0;

	// persist each render when dependencies change
	useEffect(() => {
		try {
			localStorage.setItem('vaultNotesV1', JSON.stringify(notes));
			localStorage.setItem('activeFileIdV1', activeFileId);
			localStorage.setItem('favoritesV1', JSON.stringify(favorites));
			localStorage.setItem('userSettingsV1', JSON.stringify(settings));
		} catch {}
	}, [notes, activeFileId, favorites, settings]);

	const toggleFavorite = useCallback(() => {
		if (!activeNote) return;
		setFavorites((prev) => {
			const next = { ...prev };
			if (next[activeNote.id]) {
				delete next[activeNote.id];
			} else {
				next[activeNote.id] = true;
			}
			return next;
		});
		if (userId && activeNote) {
			const fav = !favorites[activeNote.id];
			void localNotes.update(activeNote.id, { isFavorite: fav });
		}
	}, [activeNote, userId, favorites]);

	const handleDeleteFile = useCallback(async (id: string) => {
		setNotes((prev) => {
			const next = { ...prev };
			delete next[id];
			persist(next, activeFileId === id ? '' : activeFileId);
			return next;
		});
		if (userId) {
			try {
				await localNotes.delete(id);
			} catch (err) {
				console.warn('notes.delete error:', err);
				setToastMsg('Не удалось удалить');
				setToastOpen(true);
			}
		}
		setMode('list');
		if (activeFileId === id) {
			const remaining = Object.values(notes).filter((n) => n.id !== id);
			const nextId = remaining[0]?.id ?? '';
			setActiveFileId(nextId);
			try {
				localStorage.setItem('activeFileIdV1', nextId);
			} catch {}
			setCursor({ line: 0, column: 0 });
		}
	}, [activeFileId, notes, persist, userId]);

	const handleCreateFile = useCallback(async (name: string) => {
		const id = (crypto && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `${Date.now()}-0000-4000-8000-000000000000`;
		const newNote: VaultNote = { id, name, updated: 'только что', content: '', tags: [] };
		setNotes((prev) => {
			const next = { [id]: newNote, ...prev };
			persist(next, id);
			return next;
		});
		if (userId) {
			try {
				await localNotes.insert({
					id,
					userId,
					title: name,
					content: '',
					updatedAt: new Date().toISOString(),
					isFavorite: false,
				});
			} catch (err) {
				console.warn('notes.insert error:', err);
				setToastMsg('Не удалось создать заметку');
				setToastOpen(true);
			}
		}
		setActiveFileId(id);
		setMode('editor');
		setCursor({ line: 0, column: 0 });
		setShowCreate(false);
	}, [persist, userId]);

	const handleSaveTags = useCallback((tags: string[]) => {
		if (!activeNote) return;
		setNotes((prev) => ({
			...prev,
			[activeNote.id]: {
				...activeNote,
				tags,
			},
		}));
		setShowTags(false);
		setToastMsg('Теги обновлены');
		setToastOpen(true);
	}, [activeNote]);

  return (
		<div className="app-surface relative flex min-h-screen w-full">
			{/* Мобильный топ-бар */}
			<div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-obsidian-border/60 bg-black/40 px-3 backdrop-blur md:hidden">
				<button
					type="button"
					onClick={() => setMobileSidebarOpen(true)}
					className="rounded-md border border-obsidian-border/60 bg-black/40 px-3 py-1.5 text-sm text-gray-200"
				>
					Меню
				</button>
				<span className="text-xs uppercase tracking-[0.35em] text-obsidian-muted">CONNECT</span>
				<button
					type="button"
					onClick={() => handleSelectNav('search')}
					className="rounded-md border border-obsidian-border/60 bg-black/40 px-3 py-1.5 text-sm text-gray-200"
				>
					Поиск
				</button>
			</div>
			{/* Сайдбар: десктоп */}
			<Sidebar
				navItems={builtInNavItems}
				activeNavId={navId}
				onSelectNav={(id) => { handleSelectNav(id); setMobileSidebarOpen(false); }}
				onLogoClick={() => { setMode('welcome'); setMobileSidebarOpen(false); }}
				className="hidden md:flex"
			/>
			{/* Сайдбар: мобильный drawer */}
			<div className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform md:hidden ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
				<Sidebar
					navItems={builtInNavItems}
					activeNavId={navId}
					onSelectNav={(id) => { handleSelectNav(id); setMobileSidebarOpen(false); }}
					onLogoClick={() => { setMode('welcome'); setMobileSidebarOpen(false); }}
					className="h-full"
				/>
			</div>
			{mobileSidebarOpen ? (
				<div
					className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
					onClick={() => setMobileSidebarOpen(false)}
				/>
			) : null}

			<main className="flex flex-1 flex-col pt-12 md:pt-0">
				{mode === 'welcome' ? (
					<Welcome onGoToFiles={() => { setNavId('files'); setMode('list'); }} />
				) : mode === 'list' ? (
					<FileList
						files={files}
						onOpen={handleSelectFile}
						onDelete={handleDeleteFile}
						onRequestCreate={() => setShowCreate(true)}
					/>
				) : mode === 'tags' ? (
					<TagBrowser
						notes={Object.fromEntries(files.map((f) => [f.id, { id: f.id, name: f.name, tags: notes[f.id]?.tags ?? [] }]))}
						onOpen={handleSelectFile}
					/>
				) : mode === 'favorites' ? (
					<FileList
						title="Закладки"
						emptyHint="Закладок пока нет. Откройте заметку и нажмите «В закладки»."
						files={files.filter((f) => !!favorites[f.id])}
						onOpen={handleSelectFile}
						showDelete={false}
						showCreateButton={false}
					/>
				) : (
					<Editor
						title={editorTitle}
						subtitle={editorSubtitle}
						content={editorContent}
						onChange={handleContentChange}
						onSave={handleSave}
						onClose={handleClose}
						onCursorChange={handleCursorChange}
						onOpenTags={() => setShowTags(true)}
						tagsCount={editorTags.length}
						onToggleFavorite={toggleFavorite}
						isFavorite={!!(activeNote && favorites[activeNote.id])}
					/>
				)}
			</main>
			<StatusBar characters={characterCount} lines={line} column={column} />
			<NewNoteModal open={showCreate} onCancel={() => setShowCreate(false)} onCreate={handleCreateFile} />
			<TagsModal open={showTags} initialTags={editorTags} onCancel={() => setShowTags(false)} onSave={handleSaveTags} />
			<SearchOverlay
				open={showSearch}
				query={searchQuery}
				onQueryChange={setSearchQuery}
				results={files
					.filter((n) => {
						const q = searchQuery.trim().toLowerCase();
						if (!q) return false;
						const inName = n.name.toLowerCase().includes(q);
						const note = notes[n.id];
						const inContent = (note?.content ?? '').toLowerCase().includes(q);
						const inTags = (note?.tags ?? []).some((t) => t.toLowerCase().includes(q));
						return inName || inContent || inTags;
					})
					.slice(0, 50)
					.map((n) => ({
						id: n.id,
						name: n.name,
						snippet: (notes[n.id]?.content ?? '').slice(0, 140),
					}))}
				onClose={() => {
					setShowSearch(false);
					setSearchQuery('');
				}}
				onOpen={(id) => {
					setShowSearch(false);
					setSearchQuery('');
					handleSelectFile(id);
				}}
			/>
			<SettingsModal
				open={showSettings}
				initial={settings}
				onClose={() => setShowSettings(false)}
				onSave={(next) => {
					(async () => {
						setSettings(next);
						document.body.classList.remove('theme-dark', 'theme-light', 'theme-amoled');
						document.body.classList.add(`theme-${next.theme}`);
						if (userId) {
							await localProfiles.update(userId, {
								firstName: next.firstName,
								lastName: next.lastName,
								avatarUrl: next.avatarDataUrl ?? null,
							});
						}
						setToastMsg('Настройки сохранены');
						setToastOpen(true);
					})();
				}}
				onLogout={() => {
					(async () => {
						await localAuth.signOut();
						setToastMsg('Вы вышли из аккаунта');
						setToastOpen(true);
						setShowSettings(false);
						window.location.href = '/';
					})();
				}}
				onChangePassword={() => {
					setToastMsg('Пароль обновлён');
					setToastOpen(true);
				}}
			/>
			<Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
		</div>
	);
}

// Сохранение и восстановление состояния в localStorage
export function usePersistNotes(notes: Record<string, VaultNote>, activeFileId: string) {
	useEffect(() => {
		try {
			localStorage.setItem('vaultNotesV1', JSON.stringify(notes));
		} catch {}
	}, [notes]);
	useEffect(() => {
		try {
			localStorage.setItem('activeFileIdV1', activeFileId);
		} catch {}
	}, [activeFileId]);
}
