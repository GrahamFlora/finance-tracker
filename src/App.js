import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, getDoc, setDoc, setLogLevel } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { TrendingUp, TrendingDown, Trash2, CheckCircle, XCircle, BarChart as BarChartIcon, PieChart as PieChartIcon, Camera, X as XIcon, Edit2 } from 'lucide-react';

// --- Firebase Configuration ---
// This configuration is provided by the environment.
// eslint-disable-next-line no-undef
const firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG);
// eslint-disable-next-line no-undef
const appId = process.env.REACT_APP_APP_ID || 'default-app-id';

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [view, setView] = useState('dashboard');
    const [debts, setDebts] = useState([]);
    const [incomes, setIncomes] = useState([]);
    const [incomeGoal, setIncomeGoal] = useState(6000);
    const [db, setDb] = useState(null);
    const [storage, setStorage] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            const storageInstance = getStorage(app);
            setDb(dbInstance);
            setStorage(storageInstance);
            setLogLevel('debug');

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        // eslint-disable-next-line no-undef
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            // eslint-disable-next-line no-undef
                            await signInWithCustomToken(authInstance, __initial_auth_token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (error) {
                        console.error("Error during sign-in:", error);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization error:", error);
            setIsAuthReady(true);
        }
    }, []);

    // --- Data Fetching from Firestore ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) {
            if(isAuthReady) setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const debtColPath = `artifacts/${appId}/users/${userId}/debts`;
        const incomeColPath = `artifacts/${appId}/users/${userId}/incomes`;
        const goalDocPath = `artifacts/${appId}/users/${userId}/settings`;

        const debtQuery = query(collection(db, debtColPath));
        const incomeQuery = query(collection(db, incomeColPath));
        const goalDocRef = doc(db, goalDocPath, 'incomeGoal');

        const unsubDebts = onSnapshot(debtQuery, (snap) => { setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setIsLoading(false); }, (err) => { console.error(err); setIsLoading(false); });
        const unsubIncomes = onSnapshot(incomeQuery, (snap) => { setIncomes(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, (err) => console.error(err));
        const unsubGoal = onSnapshot(goalDocRef, (doc) => {
            if (doc.exists()) {
                setIncomeGoal(doc.data().goal);
            }
        }, (err) => console.error(err));

        return () => { unsubDebts(); unsubIncomes(); unsubGoal(); };
    }, [isAuthReady, db, userId]);

    // --- Data Handling Functions ---
    const handleAdd = async (type, item) => {
        if (!db || !storage || !userId) return;

        let imageUrl = '';
        let imagePath = '';

        if (item.imageFile) {
            const filePath = `artifacts/${appId}/users/${userId}/${Date.now()}-${item.imageFile.name}`;
            const storageRef = ref(storage, filePath);
            await uploadBytes(storageRef, item.imageFile);
            imageUrl = await getDownloadURL(storageRef);
            imagePath = filePath;
        }
        
        const { imageFile, ...dataToSave } = item;
        
        const colPath = `artifacts/${appId}/users/${userId}/${type}`;
        try {
            const dateToStore = dataToSave.date ? dataToSave.date : new Date().toISOString();
            await addDoc(collection(db, colPath), { ...dataToSave, date: dateToStore, userId, imageUrl, imagePath });
        } catch (error) {
            console.error(`Error adding ${type}:`, error);
        }
    };

    const handleUpdateDebt = async (id, newStatus) => {
        if (!db || !userId) return;
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/debts`, id);
        try { await updateDoc(docRef, { paid: newStatus }); } catch (error) { console.error("Error updating debt:", error); }
    };

    const handleDelete = async (type, id) => {
        if (!db || !storage || !userId) return;
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/${type}`, id);
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const { imagePath } = docSnap.data();
                if (imagePath) {
                    const imageRef = ref(storage, imagePath);
                    await deleteObject(imageRef).catch(err => console.error("Error deleting image from storage:", err));
                }
            }
            await deleteDoc(docRef);
        } catch (error) {
            console.error(`Error deleting ${type}:`, error);
        }
    };
    
    const handleUpdateGoal = async (newGoal) => {
        if (!db || !userId) return;
        const goalDocRef = doc(db, `artifacts/${appId}/users/${userId}/settings`, 'incomeGoal');
        try {
            await setDoc(goalDocRef, { goal: newGoal });
        } catch (error) {
            console.error("Error updating goal:", error);
        }
    };

    // --- Render Logic ---
    const renderView = () => {
        switch (view) {
            case 'debt': return <DebtTracker debts={debts} onAddDebt={(item) => handleAdd('debts', item)} onUpdateDebt={handleUpdateDebt} onDeleteDebt={(id) => handleDelete('debts', id)} />;
            case 'income': return <IncomeTracker incomes={incomes} onAddIncome={(item) => handleAdd('incomes', item)} onDeleteIncome={(id) => handleDelete('incomes', id)} monthlyGoal={incomeGoal} onUpdateGoal={handleUpdateGoal} />;
            default: return <Dashboard debts={debts} incomes={incomes} />;
        }
    };

    if (isLoading) { return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-teal-500"></div></div>; }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col">
            <main className="flex-grow p-4 sm:p-6 md:p-8">{renderView()}</main>
            <BottomNav activeView={view} setView={setView} />
        </div>
    );
}

// --- UI Components ---
const Tooltip = ({ children, tip }) => (<div className="relative flex items-center group">{children}<div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none shadow-lg border border-gray-700 z-10">{tip}</div></div>);
const BottomNav = ({ activeView, setView }) => {
    const navItems = [{ id: 'debt', icon: <TrendingDown className="w-6 h-6" />, label: 'Debts' }, { id: 'dashboard', icon: <BarChartIcon className="w-6 h-6" />, label: 'Dashboard' }, { id: 'income', icon: <TrendingUp className="w-6 h-6" />, label: 'Income' }];
    return (<nav className="sticky bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700"><div className="flex justify-around max-w-lg mx-auto">{navItems.map(item => (<button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center justify-center w-full pt-3 pb-2 transition-colors duration-200 ${activeView === item.id ? 'text-teal-400' : 'text-gray-400 hover:text-teal-300'}`}><Tooltip tip={item.label}>{item.icon}</Tooltip><span className="text-xs mt-1">{item.label}</span></button>))}</div></nav>);
};
const YearMonthPicker = ({ currentDate, setCurrentDate, allDates }) => {
    const yearRange = useMemo(() => { const years = new Set(allDates.map(d => new Date(d.date).getFullYear())); const currentYear = new Date().getFullYear(); years.add(currentYear); if (years.size === 0) return [currentYear]; const minYear = Math.min(...years); const maxYear = Math.max(...years, currentYear); const range = []; for (let y = maxYear; y >= minYear; y--) { range.push(y); } return range; }, [allDates]);
    const months = useMemo(() => Array.from({ length: 12 }, (e, i) => new Date(null, i + 1, null).toLocaleDateString("en", { month: "long" })), []);
    const handleYearChange = (e) => setCurrentDate(new Date(parseInt(e.target.value, 10), currentDate.getMonth(), 1));
    const handleMonthChange = (e) => setCurrentDate(new Date(currentDate.getFullYear(), parseInt(e.target.value, 10), 1));
    return (<div className="flex items-center justify-center space-x-2"><select value={currentDate.getMonth()} onChange={handleMonthChange} className="bg-gray-700 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500">{months.map((month, index) => <option key={month} value={index}>{month}</option>)}</select><select value={currentDate.getFullYear()} onChange={handleYearChange} className="bg-gray-700 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500">{yearRange.map(year => <option key={year} value={year}>{year}</option>)}</select></div>);
};

// --- Page Components ---
const Dashboard = ({ debts, incomes }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('all');
    const [chartType, setChartType] = useState('bar');
    const [filter, setFilter] = useState('all');

    const { monthlyIncomes, monthlyDebts } = useMemo(() => {
        const filteredIncomes = incomes.filter(i => { const incomeDate = new Date(i.date); return incomeDate.getFullYear() === currentDate.getFullYear() && incomeDate.getMonth() === currentDate.getMonth(); });
        const filteredDebts = debts.filter(d => { const debtDate = new Date(d.date); return debtDate.getFullYear() === currentDate.getFullYear() && debtDate.getMonth() === currentDate.getMonth(); });
        return { monthlyIncomes: filteredIncomes, monthlyDebts: filteredDebts };
    }, [incomes, debts, currentDate]);

    const dataSet = useMemo(() => {
        return viewMode === 'monthly' ? { incomes: monthlyIncomes, debts: monthlyDebts } : { incomes, debts };
    }, [viewMode, monthlyIncomes, monthlyDebts, incomes, debts]);

    const totalIncome = useMemo(() => dataSet.incomes.reduce((sum, i) => sum + Number(i.amount), 0), [dataSet.incomes]);
    const outstandingDebt = useMemo(() => dataSet.debts.filter(d => !d.paid).reduce((sum, d) => sum + Number(d.amount), 0), [dataSet.debts]);
    const paidDebt = useMemo(() => dataSet.debts.filter(d => d.paid).reduce((sum, d) => sum + Number(d.amount), 0), [dataSet.debts]);
    const chartData = [{ name: 'Income', value: totalIncome, color: '#2dd4bf', filterKey: 'income' }, { name: 'Outstanding Debt', value: outstandingDebt, color: '#f87171', filterKey: 'outstanding' }, { name: 'Paid Debt', value: paidDebt, color: '#4ade80', filterKey: 'paid' }];
    const filteredData = useMemo(() => { let data = []; switch (filter) { case 'income': data = dataSet.incomes.map(i => ({ ...i, type: 'Income' })); break; case 'outstanding': data = dataSet.debts.filter(d => !d.paid).map(d => ({ ...d, type: 'Debt' })); break; case 'paid': data = dataSet.debts.filter(d => d.paid).map(d => ({ ...d, type: 'Debt' })); break; default: data = [...dataSet.incomes.map(i => ({ ...i, type: 'Income' })), ...dataSet.debts.map(d => ({ ...d, type: 'Debt' }))]; } return data.sort((a, b) => new Date(b.date) - new Date(a.date)); }, [filter, dataSet]);
    const handleChartClick = (payload) => { if (!payload || !payload.activePayload || !payload.activePayload[0]) { setFilter('all'); return; } const clickedFilter = payload.activePayload[0].payload.filterKey; setFilter(current => (current === clickedFilter ? 'all' : clickedFilter)); };
    
    return (
        <div className="space-y-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-center text-teal-400">Dashboard</h1>
            <div className="bg-gray-800 p-4 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                        <h2 className="text-xl font-semibold">Financial Overview</h2>
                        {viewMode === 'monthly' && <YearMonthPicker currentDate={currentDate} setCurrentDate={setCurrentDate} allDates={[...incomes, ...debts]} />}
                    </div>
                    <div className="flex items-center bg-gray-900/50 rounded-full p-1 flex-shrink-0">
                        <button onClick={() => setViewMode('monthly')} className={`px-4 py-1 text-sm rounded-full transition-colors ${viewMode === 'monthly' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Monthly</button>
                        <button onClick={() => setViewMode('all')} className={`px-4 py-1 text-sm rounded-full transition-colors ${viewMode === 'all' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>All Time</button>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center"><div className={`p-4 rounded-lg shadow-lg cursor-pointer transition-all ${filter === 'income' ? 'bg-teal-800 ring-2 ring-teal-400' : 'bg-gray-800'}`} onClick={() => setFilter(f => f === 'income' ? 'all' : 'income')}><h3 className="text-sm font-semibold text-gray-400">Income</h3><p className="text-2xl font-bold text-teal-400">₱{totalIncome.toLocaleString()}</p></div><div className={`p-4 rounded-lg shadow-lg cursor-pointer transition-all ${filter === 'outstanding' ? 'bg-red-800 ring-2 ring-red-400' : 'bg-gray-800'}`} onClick={() => setFilter(f => f === 'outstanding' ? 'all' : 'outstanding')}><h3 className="text-sm font-semibold text-gray-400">Outstanding Debt</h3><p className="text-2xl font-bold text-red-400">₱{outstandingDebt.toLocaleString()}</p></div><div className={`p-4 rounded-lg shadow-lg cursor-pointer transition-all ${filter === 'paid' ? 'bg-green-800 ring-2 ring-green-400' : 'bg-gray-800'}`} onClick={() => setFilter(f => f === 'paid' ? 'all' : 'paid')}><h3 className="text-sm font-semibold text-gray-400">Paid Debt</h3><p className="text-2xl font-bold text-green-400">₱{paidDebt.toLocaleString()}</p></div></div>
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg"><div className="flex justify-end mb-4"><div className="flex items-center bg-gray-900/50 rounded-full p-1"><Tooltip tip="Bar Chart"><button onClick={() => setChartType('bar')} className={`p-2 rounded-full transition-colors ${chartType === 'bar' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}><BarChartIcon size={20}/></button></Tooltip><Tooltip tip="Pie Chart"><button onClick={() => setChartType('pie')} className={`p-2 rounded-full transition-colors ${chartType === 'pie' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}><PieChartIcon size={20}/></button></Tooltip></div></div><div style={{ width: '100%', height: 300 }}><ResponsiveContainer>{chartType === 'bar' ? (<BarChart data={chartData} onClick={handleChartClick}><CartesianGrid strokeDasharray="3 3" stroke="#4a5568" /><XAxis dataKey="name" stroke="#a0aec0" /><YAxis stroke="#a0aec0" tickFormatter={(value) => `₱${value/1000}k`} /><RechartsTooltip contentStyle={{ backgroundColor: '#1a202c', border: '1px solid #4a5568' }} labelStyle={{ color: '#e2e8f0' }} formatter={(value) => `₱${value.toLocaleString()}`} /><Bar dataKey="value" barSize={50} className="cursor-pointer">{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={filter === 'all' || filter === entry.filterKey ? entry.color : `${entry.color}80`} />)}</Bar></BarChart>) : (<PieChart><Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label onClick={(data) => handleChartClick({ activePayload: [{ payload: data }] })}>{chartData.map((entry) => <Cell key={`cell-${entry.filterKey}`} fill={filter === 'all' || filter === entry.filterKey ? entry.color : `${entry.color}80`} className="cursor-pointer" />)}</Pie><RechartsTooltip contentStyle={{ backgroundColor: '#1a202c', border: '1px solid #4a5568' }} formatter={(value, name, props) => [`₱${value.toLocaleString()}`, props.payload.name]} /><Legend onClick={(data) => setFilter(f => f === data.payload.filterKey ? 'all' : data.payload.filterKey)} wrapperStyle={{cursor: 'pointer'}}/></PieChart>)}</ResponsiveContainer></div></div>
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg"><h2 className="text-xl font-semibold mb-4">Filtered Transactions: <span className="text-teal-400 capitalize">{filter}</span></h2><div className="overflow-x-auto"><table className="w-full text-left table-auto"><thead className="border-b border-gray-600 text-gray-400"><tr><th className="p-2">Name/Source</th><th className="p-2">Amount</th><th className="p-2 hidden sm:table-cell">Date</th><th className="p-2">Type</th><th className="p-2">Status</th></tr></thead>
            <tbody>
                {filteredData.length === 0 ? (
                    <tr><td colSpan="5" className="text-center text-gray-500 py-4">No transactions match the filter.</td></tr>
                ) : (
                    filteredData.map((item, index) => (<tr key={item.id} className={`border-b border-gray-700 ${index % 2 === 0 ? 'bg-gray-900/50' : ''}`}><td className="p-2 font-medium">{item.name}</td><td className={`p-2 font-semibold ${item.type === 'Income' ? 'text-green-400' : 'text-red-400'}`}>₱{Number(item.amount).toLocaleString()}</td><td className="p-2 text-sm text-gray-500 hidden sm:table-cell">{new Date(item.date).toLocaleDateString()}</td><td className="p-2"><span className={`px-2 py-1 text-xs rounded-full ${item.type === 'Income' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{item.type}</span></td><td className="p-2">{item.type === 'Debt' ? <span className={`px-2 py-1 text-xs rounded-full ${item.paid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{item.paid ? 'Paid' : 'Unpaid'}</span> : 'N/A'}</td></tr>))
                )}
            </tbody>
            </table></div></div>
        </div>
    );
};

const EntryForm = ({ type, onSubmit }) => {
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            setImageFile(e.target.files[0]);
            setImagePreview(URL.createObjectURL(e.target.files[0]));
        }
    };
    
    const removeImage = () => {
        setImageFile(null);
        setImagePreview('');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name && amount > 0 && entryDate) {
            const data = { name, amount: parseFloat(amount), date: new Date(entryDate).toISOString(), imageFile };
            if (type === 'debt') data.paid = false;
            onSubmit(data);
            setName(''); setAmount(''); setImageFile(null); setImagePreview('');
        }
    };
    
    const isDebt = type === 'debt';

    return (
        <form onSubmit={handleSubmit} className="bg-gray-800 p-4 rounded-lg space-y-4">
            <h2 className="text-xl font-semibold">Add New {isDebt ? 'Debt' : 'Income'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={isDebt ? 'Debt Name' : 'Income Source'} className="md:col-span-2 w-full bg-gray-700 p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full bg-gray-700 p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="w-full md:col-span-2 bg-gray-700 p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                 <div className="flex items-center space-x-2">
                    {imagePreview ? (
                        <div className="relative"><img src={imagePreview} alt="Preview" className="h-10 w-10 rounded object-cover"/><button type="button" onClick={removeImage} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5"><XIcon size={14} /></button></div>
                    ) : (
                        <label className="flex-1 cursor-pointer bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors text-center"><Camera size={20} className="inline-block mr-2"/><span>Attach</span><input type="file" accept="image/*" className="hidden" onChange={handleImageChange} /></label>
                    )}
                </div>
            </div>
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded transition-colors">Add {isDebt ? 'Debt' : 'Income'}</button>
        </form>
    );
};


const DebtTracker = ({ debts, onAddDebt, onUpdateDebt, onDeleteDebt }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('all');
    
    const displayedDebts = useMemo(() => {
        const sorted = [...debts].sort((a, b) => new Date(b.date) - new Date(a.date));
        if (viewMode === 'all') return sorted;
        return sorted.filter(debt => { const d = new Date(debt.date); return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === currentDate.getMonth(); });
    }, [debts, currentDate, viewMode]);

    const displayedTotal = useMemo(() => displayedDebts.reduce((sum, d) => sum + Number(d.amount), 0), [displayedDebts]);
    const totalOutstandingDebt = useMemo(() => debts.filter(d => !d.paid).reduce((sum, d) => sum + Number(d.amount), 0), [debts]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="text-center"><h1 className="text-3xl font-bold text-teal-400">Debt Tracker</h1><p className="text-gray-400">Total Outstanding (All Time): <span className="font-bold text-red-400">₱{totalOutstandingDebt.toLocaleString()}</span></p></div>
            <EntryForm type="debt" onSubmit={onAddDebt} />
            <div className="bg-gray-800 p-4 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                        <h2 className="text-xl font-semibold">Debt Entries</h2>
                        {viewMode === 'monthly' && <YearMonthPicker currentDate={currentDate} setCurrentDate={setCurrentDate} allDates={debts} />}
                    </div>
                    <div className="flex items-center bg-gray-900/50 rounded-full p-1 flex-shrink-0">
                        <button onClick={() => setViewMode('monthly')} className={`px-4 py-1 text-sm rounded-full transition-colors ${viewMode === 'monthly' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Monthly</button>
                        <button onClick={() => setViewMode('all')} className={`px-4 py-1 text-sm rounded-full transition-colors ${viewMode === 'all' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>All Time</button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-auto">
                        <thead><tr className="border-b border-gray-600 text-gray-400"><th className="p-2 w-12"></th><th className="p-2">Name</th><th className="p-2">Amount</th><th className="p-2 hidden sm:table-cell">Date</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th></tr></thead>
                        <tbody>
                            {displayedDebts.length > 0 ? displayedDebts.map((debt, index) => (
                                <tr key={debt.id} className={`border-b border-gray-700 ${index % 2 === 0 ? 'bg-gray-900/50' : ''} ${debt.paid ? 'opacity-60' : ''}`}>
                                    <td className="p-2">{debt.imageUrl && <a href={debt.imageUrl} target="_blank" rel="noopener noreferrer"><img src={debt.imageUrl} alt={debt.name} className="h-10 w-10 rounded-md object-cover"/></a>}</td>
                                    <td className="p-2 font-medium">{debt.name}</td>
                                    <td className={`p-2 ${debt.paid ? 'text-green-400' : 'text-red-400'}`}>₱{Number(debt.amount).toLocaleString()}</td>
                                    <td className="p-2 text-sm text-gray-500 hidden sm:table-cell">{new Date(debt.date).toLocaleDateString()}</td>
                                    <td className="p-2"><span className={`px-2 py-1 text-xs rounded-full ${debt.paid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{debt.paid ? 'Paid' : 'Unpaid'}</span></td>
                                    <td className="p-2 text-right"><div className="flex justify-end items-center space-x-2"><Tooltip tip={debt.paid ? 'Mark as Unpaid' : 'Mark as Paid'}><button onClick={() => onUpdateDebt(debt.id, !debt.paid)} className={`p-2 rounded-full ${debt.paid ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`}>{debt.paid ? <XCircle size={18} /> : <CheckCircle size={18} />}</button></Tooltip><Tooltip tip="Delete Debt"><button onClick={() => onDeleteDebt(debt.id)} className="bg-red-600 hover:bg-red-700 p-2 rounded-full"><Trash2 size={18} /></button></Tooltip></div></td>
                                </tr>
                            )) : (<tr><td colSpan="6" className="text-center text-gray-500 py-4">No debts recorded for this period.</td></tr>)}
                        </tbody>
                        <tfoot className="border-t-2 border-gray-600 font-bold"><tr className="text-right"><td colSpan="6" className="p-2">{viewMode === 'monthly' ? 'Monthly' : 'Grand'} Total: <span className="text-red-400">₱{displayedTotal.toLocaleString()}</span></td></tr></tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

const IncomeTracker = ({ incomes, onAddIncome, onDeleteIncome, monthlyGoal, onUpdateGoal }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('all');
    const [isEditingGoal, setIsEditingGoal] = useState(false);
    const [goalInput, setGoalInput] = useState(monthlyGoal);

    useEffect(() => {
        setGoalInput(monthlyGoal);
    }, [monthlyGoal]);

    const handleSetGoal = () => {
        const newGoal = parseFloat(goalInput);
        if (!isNaN(newGoal) && newGoal > 0) {
            onUpdateGoal(newGoal);
            setIsEditingGoal(false);
        }
    };
    
    const monthlyIncomesForProgress = useMemo(() => incomes.filter(income => { const d = new Date(income.date); return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === currentDate.getMonth(); }), [incomes, currentDate]);
    const totalForProgress = useMemo(() => monthlyIncomesForProgress.reduce((sum, i) => sum + Number(i.amount), 0), [monthlyIncomesForProgress]);
    const progress = Math.min((totalForProgress / monthlyGoal) * 100, 100);
    const displayedIncomes = useMemo(() => { const sorted = [...incomes].sort((a, b) => new Date(b.date) - new Date(a.date)); if (viewMode === 'all') return sorted; return monthlyIncomesForProgress.sort((a, b) => new Date(b.date) - new Date(a.date)); }, [incomes, viewMode, monthlyIncomesForProgress]);
    const displayedTotal = useMemo(() => displayedIncomes.reduce((sum, i) => sum + Number(i.amount), 0), [displayedIncomes]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-teal-400">Income Tracker</h1>
                <div className="flex items-center justify-center gap-2 text-gray-400 mt-1">
                    <span>Monthly Goal:</span>
                    {isEditingGoal ? (
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={goalInput} 
                                onChange={(e) => setGoalInput(e.target.value)} 
                                className="bg-gray-700 p-1 rounded w-28 text-center"
                                onKeyDown={(e) => e.key === 'Enter' && handleSetGoal()}
                            />
                            <button onClick={handleSetGoal} className="bg-green-600 rounded-full p-1 text-white"><CheckCircle size={16}/></button>
                            <button onClick={() => setIsEditingGoal(false)} className="bg-red-600 rounded-full p-1 text-white"><XIcon size={16}/></button>
                        </div>
                    ) : (
                        <button onClick={() => setIsEditingGoal(true)} className="font-bold text-green-400 hover:underline flex items-center gap-2">
                            <span>₱{monthlyGoal.toLocaleString()}</span>
                            <Edit2 size={14} className="opacity-50"/>
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg"><h2 className="text-lg font-semibold text-center">{currentDate.toLocaleString('default', { month: 'long' })}'s Progress</h2><p className="text-2xl font-bold text-center my-2">₱{totalForProgress.toLocaleString()} / ₱{monthlyGoal.toLocaleString()}</p><div className="w-full bg-gray-700 rounded-full h-4"><div className="bg-green-500 h-4 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div></div></div>
            <EntryForm type="income" onSubmit={onAddIncome} />
            <div className="bg-gray-800 p-4 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                        <h2 className="text-xl font-semibold">Income Entries</h2>
                        {viewMode === 'monthly' && <YearMonthPicker currentDate={currentDate} setCurrentDate={setCurrentDate} allDates={incomes} />}
                    </div>
                    <div className="flex items-center bg-gray-900/50 rounded-full p-1 flex-shrink-0">
                        <button onClick={() => setViewMode('monthly')} className={`px-4 py-1 text-sm rounded-full transition-colors ${viewMode === 'monthly' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Monthly</button>
                        <button onClick={() => setViewMode('all')} className={`px-4 py-1 text-sm rounded-full transition-colors ${viewMode === 'all' ? 'bg-teal-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>All Time</button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-auto">
                        <thead><tr className="border-b border-gray-600 text-gray-400"><th className="p-2 w-12"></th><th className="p-2">Source</th><th className="p-2">Amount</th><th className="p-2 hidden sm:table-cell">Date</th><th className="p-2 text-right">Action</th></tr></thead>
                        <tbody>
                            {displayedIncomes.length > 0 ? displayedIncomes.map((income, index) => (
                                <tr key={income.id} className={`border-b border-gray-700 ${index % 2 === 0 ? 'bg-gray-900/50' : ''}`}>
                                    <td className="p-2">{income.imageUrl && <a href={income.imageUrl} target="_blank" rel="noopener noreferrer"><img src={income.imageUrl} alt={income.name} className="h-10 w-10 rounded-md object-cover"/></a>}</td>
                                    <td className="p-2 font-medium">{income.name}</td>
                                    <td className="p-2 text-green-400">₱{Number(income.amount).toLocaleString()}</td>
                                    <td className="p-2 text-sm text-gray-500 hidden sm:table-cell">{new Date(income.date).toLocaleDateString()}</td>
                                    <td className="p-2"><div className="flex justify-end items-center"><Tooltip tip="Delete Income"><button onClick={() => onDeleteIncome(income.id)} className="text-red-500 hover:text-red-400 p-2 rounded-full hover:bg-gray-700"><Trash2 size={18} /></button></Tooltip></div></td>
                                </tr>
                            )) : (<tr><td colSpan="5" className="text-center text-gray-500 py-4">No income recorded for this period.</td></tr>)}
                        </tbody>
                        <tfoot className="border-t-2 border-gray-600 font-bold"><tr className="text-right"><td colSpan="5" className="p-2">{viewMode === 'monthly' ? 'Monthly' : 'Grand'} Total: <span className="text-green-400">₱{displayedTotal.toLocaleString()}</span></td></tr></tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- CSS for Animations ---
const style = document.createElement('style');
style.textContent = `@keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }`;
document.head.append(style);
