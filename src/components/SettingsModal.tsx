import { useEffect, useMemo, useRef, useState } from 'react';
import { FiX, FiUser, FiMail, FiLock, FiLogOut, FiImage, FiMonitor, FiEye } from 'react-icons/fi';
import { localAuth, localProfiles } from '../lib/localAuth';
import { decryptSecretWithPassword } from '../lib/crypto';
import { generateAvatarDataUrl } from '../lib/avatar';

export type ThemeOption = 'dark' | 'light' | 'amoled';

export interface UserSettings {
	firstName: string;
	lastName: string;
	email: string;
	avatarDataUrl?: string;
	theme: ThemeOption;
}

interface SettingsModalProps {
	open: boolean;
	initial: UserSettings;
	onClose: () => void;
	onSave: (next: UserSettings) => void;
	onLogout: () => void;
	onChangePassword: (newPassword: string) => void;
}

export function SettingsModal({ open, initial, onClose, onSave, onLogout, onChangePassword }: SettingsModalProps) {
	const [form, setForm] = useState<UserSettings>(initial);
	const [newPassword, setNewPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const fileRef = useRef<HTMLInputElement | null>(null);
	const [revealMode, setRevealMode] = useState(false);
	const [revealPass, setRevealPass] = useState('');
	const [revealValue, setRevealValue] = useState<string | null>(null);
	const [revealErr, setRevealErr] = useState<string | null>(null);
	const fallbackAvatar = useMemo(
		() => generateAvatarDataUrl((form.firstName || form.lastName || form.email), form.email),
		[form.firstName, form.lastName, form.email]
	);

	useEffect(() => {
		if (open) {
			setForm(initial);
			setNewPassword('');
			setConfirm('');
		}
	}, [open, initial]);

	if (!open) return null;

	function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			setForm((prev) => ({ ...prev, avatarDataUrl: String(reader.result) }));
		};
		reader.readAsDataURL(file);
	}

	function handleSave() {
		onSave(form);
		onClose();
	}

	function handleChangePassword() {
		if (!newPassword || newPassword !== confirm) return;
		onChangePassword(newPassword);
		setNewPassword('');
		setConfirm('');
	}

	return (
		<div className="fixed inset-0 z-50">
			<div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
			<div className="relative z-10 mx-auto mt-10 w-[92%] max-w-3xl rounded-2xl border border-obsidian-border/70 bg-[#0b0f18]/95 text-gray-100 shadow-soft">
				<div className="flex items-center justify-between border-b border-obsidian-border/60 px-6 py-4">
					<h2 className="text-lg font-semibold">Личный кабинет</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-obsidian-border/60 bg-black/40 p-2 text-gray-400 hover:text-gray-200"
						aria-label="Закрыть"
					>
						<FiX />
					</button>
				</div>

				<div className="max-h-[80vh] overflow-y-auto px-6 py-6 grid grid-cols-1 gap-6 md:grid-cols-3">
					<div className="md:col-span-1">
						<div className="flex flex-col items-center gap-3">
							<div className="relative h-28 w-28 overflow-hidden rounded-full border border-obsidian-border/70 bg-black/40">
								<img
									src={form.avatarDataUrl || fallbackAvatar}
									alt="avatar"
									className="h-full w-full object-cover"
								/>
							</div>
							<button
								type="button"
								onClick={() => fileRef.current?.click()}
								className="flex items-center gap-2 rounded-md border border-obsidian-border/70 bg-black/40 px-3 py-1.5 text-sm hover:bg-obsidian-active/40"
							>
								<FiImage /> Загрузить
							</button>
							<input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
							<button
								type="button"
								onClick={async () => {
									setForm((p) => ({ ...p, avatarDataUrl: undefined }));
									const me = await localAuth.getUser();
									if (me) {
										await localProfiles.update(me.id, { avatarUrl: null });
									}
								}}
								className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/20"
							>
								Удалить аватар
							</button>
						</div>
					</div>

					<div className="md:col-span-2 space-y-4">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<label className="flex items-center gap-2 rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2">
								<FiUser className="text-gray-400" />
								<input
									value={form.firstName}
									onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
									placeholder="Имя"
									className="w-full bg-transparent text-sm text-gray-100 placeholder:text-obsidian-muted outline-none"
								/>
							</label>
							<label className="flex items-center gap-2 rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2">
								<FiUser className="text-gray-400" />
								<input
									value={form.lastName}
									onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
									placeholder="Фамилия"
									className="w-full bg-transparent text-sm text-gray-100 placeholder:text-obsidian-muted outline-none"
								/>
							</label>
						</div>
						<label className="flex items-center gap-2 rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2">
							<FiMail className="text-gray-400" />
							<input
								value={form.email}
								onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
								placeholder="Почта"
								type="email"
								className="w-full bg-transparent text-sm text-gray-100 placeholder:text-obsidian-muted outline-none"
							/>
						</label>

						<div className="rounded-lg border border-obsidian-border/60 p-3">
							<p className="mb-3 flex items-center gap-2 text-sm text-obsidian-muted">
								<FiLock /> Шифрование
							</p>
							{!revealMode ? (
								<button
									type="button"
									onClick={() => setRevealMode(true)}
									className="rounded-md border border-obsidian-border/70 bg-obsidian-active/30 px-3 py-2 text-sm text-gray-100 hover:bg-obsidian-active/50"
								>
									<FiEye className="mr-2 inline" /> Показать фразу шифрования
								</button>
							) : (
								<div className="space-y-2">
									<input
										type="password"
										placeholder="Введите пароль аккаунта"
										value={revealPass}
										onChange={(e) => setRevealPass(e.target.value)}
										className="w-full rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-obsidian-muted"
									/>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={async () => {
												setRevealErr(null);
												const me = await localAuth.getUser();
												if (!me) { setRevealErr('Нет сессии'); return; }
												const prof = await localProfiles.get(me.id);
												if (!prof?.encSalt || !prof?.masterKeyEnc) {
													setRevealErr('Фраза не найдена'); return;
												}
												const plain = await decryptSecretWithPassword(prof.masterKeyEnc, revealPass, prof.encSalt);
												if (!plain) { setRevealErr('Неверный пароль'); return; }
												setRevealValue(plain);
											}}
											className="rounded-md border border-obsidian-border/70 bg-obsidian-active/50 px-3 py-2 text-sm text-gray-100 hover:bg-obsidian-active/70"
										>
											Показать
										</button>
										<button
											type="button"
											onClick={() => { setRevealMode(false); setRevealPass(''); setRevealValue(null); setRevealErr(null); }}
											className="rounded-md border border-obsidian-border/60 bg-transparent px-3 py-2 text-sm text-obsidian-muted hover:bg-obsidian-active/30"
										>
											Скрыть
										</button>
									</div>
									{revealErr ? <p className="text-xs text-rose-400">{revealErr}</p> : null}
									{revealValue ? (
										<div className="rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2 text-sm text-gray-100">
											{revealValue}
										</div>
									) : null}
								</div>
							)}
						</div>

						<div className="rounded-lg border border-obsidian-border/60 p-3">
							<p className="mb-3 flex items-center gap-2 text-sm text-obsidian-muted">
								<FiLock /> Смена пароля
							</p>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<input
									type="password"
									placeholder="Новый пароль"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									className="rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-obsidian-muted"
								/>
								<input
									type="password"
									placeholder="Повторите пароль"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
									className="rounded-md border border-obsidian-border/60 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-obsidian-muted"
								/>
							</div>
							<div className="mt-3 flex justify-end">
								<button
									type="button"
									onClick={handleChangePassword}
									disabled={!newPassword || newPassword !== confirm}
									className="rounded-md border border-obsidian-border/70 bg-obsidian-active/50 px-4 py-2 text-sm font-semibold text-gray-100 enabled:hover:bg-obsidian-active/70 disabled:opacity-50"
								>
									Сменить пароль
								</button>
							</div>
						</div>

						<div className="rounded-lg border border-obsidian-border/60 p-3">
							<p className="mb-3 flex items-center gap-2 text-sm text-obsidian-muted">
								<FiMonitor /> Тема интерфейса
							</p>
							<div className="flex flex-wrap gap-2">
								{(['dark', 'light', 'amoled'] as ThemeOption[]).map((t) => (
									<button
										key={t}
										type="button"
										onClick={() => setForm((p) => ({ ...p, theme: t }))}
										className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
											form.theme === t
												? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
												: 'border-obsidian-border/60 bg-black/30 text-gray-300 hover:bg-obsidian-active/40'
										}`}
									>
										{t}
									</button>
								))}
							</div>
						</div>

						<div className="mt-4 flex items-center justify-between">
							<button
								type="button"
								onClick={onLogout}
								className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
							>
								<FiLogOut /> Выйти
							</button>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={onClose}
									className="rounded-md border border-obsidian-border/60 bg-transparent px-4 py-2 text-sm text-obsidian-muted hover:bg-obsidian-active/30 hover:text-gray-100"
								>
									Отмена
								</button>
								<button
									type="button"
									onClick={handleSave}
									className="rounded-md border border-obsidian-border/70 bg-obsidian-active/50 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-obsidian-active/70"
								>
									Сохранить
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}


