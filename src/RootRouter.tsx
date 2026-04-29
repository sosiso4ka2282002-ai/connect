import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import App from './App';
import NotFound from './pages/NotFound';
import { useEffect, useState } from 'react';
import { localAuth } from './lib/localAuth';

function ProtectedRoute({ children }: { children: JSX.Element }) {
	const [loading, setLoading] = useState(true);
	const [authed, setAuthed] = useState<boolean>(false);
	useEffect(() => {
		let mounted = true;
		(async () => {
			const { session } = await localAuth.getSession();
			if (!mounted) return;
			setAuthed(session);
			setLoading(false);
		})();
		return () => { mounted = false; };
	}, []);
	if (loading) {
		// Заглушка во время проверки авторизации
		return (
			<div className="flex min-h-screen items-center justify-center bg-gray-50">
				<div className="text-center">
					<div className="mb-4 text-lg text-gray-600">Проверка доступа...</div>
				</div>
			</div>
		);
	}
	if (!authed) return <Navigate to="/404" replace />;
	return children;
}

export default function RootRouter() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Landing />} />
				<Route path="/app/*" element={<ProtectedRoute><App /></ProtectedRoute>} />
				<Route path="/404" element={<NotFound />} />
				<Route path="*" element={<NotFound />} />
			</Routes>
		</BrowserRouter>
	);
}


