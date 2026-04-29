import { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { localAuth, localProfiles } from '../lib/localAuth';
import { encryptSecretWithPassword, deriveKey, exportKeyToB64, saveSessionKeyInfo, generatePassphrase, decryptSecretWithPassword } from '../lib/crypto';
import { generateAvatarDataUrl } from '../lib/avatar';

type Mode = 'signin' | 'signup';

interface AuthModalProps {
	open: boolean;
	mode: Mode;
	onClose: () => void;
	onSuccess?: () => void;
}

export function AuthModal({ open, mode, onClose, onSuccess }: AuthModalProps) {
	const [active, setActive] = useState<Mode>(mode);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// синхронизируем вкладку модала с приходящим mode при каждом открытии/смене
	useEffect(() => {
		setActive(mode);
	}, [mode, open]);

	if (!open) return null;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		try {
			if (active === 'signup') {
				const { user } = await localAuth.signUp(email, password, { first_name: firstName, last_name: lastName });
				// генерируем фразу и шифруем её паролем пользователя
				const passphrase = generatePassphrase();
				const { saltB64, enc } = await encryptSecretWithPassword(passphrase, password);
				// генерируем дефолтный аватар
				const avatarDataUrl = generateAvatarDataUrl(firstName || lastName || email, email);
				// сохраняем профиль
				await localProfiles.upsert({
					id: user.id,
					email,
					firstName,
					lastName,
					encSalt: saltB64 || null,
					masterKeyEnc: enc || null,
					avatarUrl: avatarDataUrl,
				});
				// производный ключ для шифрования заметок
				if (saltB64) {
					const encKey = await deriveKey(passphrase, saltB64);
					if (encKey) {
						const b64 = await exportKeyToB64(encKey);
						if (b64) {
							saveSessionKeyInfo(b64, saltB64);
						}
					}
				}
			} else {
				const { user } = await localAuth.signInWithPassword(email, password);
				// попытка восстановить ключ шифрования из профиля
				const prof = await localProfiles.get(user.id);
				if (prof?.masterKeyEnc) {
					if (prof.encSalt && prof.encSalt.trim() !== '') {
						const passphrase = await decryptSecretWithPassword(prof.masterKeyEnc, password, prof.encSalt);
						if (passphrase) {
							const encKey = await deriveKey(passphrase, prof.encSalt);
							if (encKey) {
								const b64 = await exportKeyToB64(encKey);
								if (b64) {
									saveSessionKeyInfo(b64, prof.encSalt);
								}
							}
						}
					} else {
						console.warn('Encryption not available on HTTP. Notes will be stored unencrypted.');
					}
				}
			}
			onClose();
			onSuccess?.();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Ошибка авторизации';
			setError(msg);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50">
			<div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
			<div className="relative z-10 mx-auto mt-14 w-[94%] max-w-3xl">
				<div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
					<div className="grid grid-cols-1 md:grid-cols-2">
						{/* Left */}
						<div className="hidden md:flex min-h-[520px] items-center justify-center bg-gray-50 p-10">
							<div className="max-w-sm text-center">
								<h3 className="text-2xl font-bold text-gray-900">Добро пожаловать в CONNECT</h3>
								<p className="mt-4 text-sm leading-6 text-gray-600">
									Локальное шифрование, автосейв и теги. Регистрация займёт меньше минуты.
								</p>
							</div>
						</div>
						{/* Right – form */}
						<div className="p-8">
							<div className="mb-6 flex items-center justify-between">
								<div className="flex gap-2">
									<button
										className={`rounded-lg px-4 py-2 text-sm transition ${active === 'signin' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
										onClick={() => setActive('signin')}
									>
										Войти
									</button>
									<button
										className={`rounded-lg px-4 py-2 text-sm transition ${active === 'signup' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
										onClick={() => setActive('signup')}
									>
										Зарегистрироваться
									</button>
								</div>
								<button
									aria-label="Закрыть"
									className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
									onClick={onClose}
								>
									<FiX className="h-5 w-5" />
								</button>
							</div>
							<form onSubmit={handleSubmit} className="space-y-4">
								{active === 'signup' && (
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										<label className="block">
											<span className="mb-1.5 block text-sm text-gray-700">Имя</span>
											<input
												value={firstName}
												onChange={(e) => setFirstName(e.target.value)}
												required
												className="w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-800"
												autoComplete="given-name"
											/>
										</label>
										<label className="block">
											<span className="mb-1.5 block text-sm text-gray-700">Фамилия</span>
											<input
												value={lastName}
												onChange={(e) => setLastName(e.target.value)}
												required
												className="w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-800"
												autoComplete="family-name"
											/>
										</label>
									</div>
								)}
								<label className="block">
									<span className="mb-1.5 block text-sm text-gray-700">Почта</span>
									<input
										type="email"
										required
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										className="w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-800"
										autoComplete="email"
									/>
								</label>
								<label className="block">
									<span className="mb-1.5 block text-sm text-gray-700">Пароль</span>
									<input
										type="password"
										required
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										className="w-full rounded-md border border-gray-300 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-800"
										autoComplete={active === 'signup' ? 'new-password' : 'current-password'}
									/>
								</label>
								{error ? <p className="text-sm text-rose-600">{error}</p> : null}
								<button
									type="submit"
									disabled={loading}
									className="mt-1.5 w-full rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
								>
									{active === 'signup' ? 'Создать аккаунт' : 'Войти'}
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}


