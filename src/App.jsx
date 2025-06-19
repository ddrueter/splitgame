import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  writeBatch,
  runTransaction,
  deleteDoc,
  getDocs,
  addDoc,
  orderBy
} from 'firebase/firestore';
import { ArrowRight, CheckCircle, XCircle, Crown, Trash2, PlusCircle, Gamepad2, Layers, BookOpen, ArrowLeft } from 'lucide-react';

// --- Firebase Configuration ---
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDUIbzv7ijXKaph2ygNL4UfG6K41h52zew",
  authDomain: "confidence-wager.firebaseapp.com",
  projectId: "confidence-wager",
  storageBucket: "confidence-wager.firebasestorage.app",
  messagingSenderId: "116956545114",
  appId: "1:116956545114:web:b04d32df56d8f40019d863"
};

const appId = 'confidence-wager-game';

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Helper Components ---

const PlayerIcon = ({ name }) => {
  const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length > 1 && names[0] && names[names.length - 1]) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
  const color = colors[(name?.length || 0) % colors.length];

  return (
    <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
};

const Loader = ({ text = "Loading..." }) => (
  <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-4"></div>
    <p className="text-lg">{text}</p>
  </div>
);

const Modal = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <div className="text-gray-300 mb-6">{children}</div>
        <div className="flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">Confirm</button>
        </div>
      </div>
    </div>
  );
};


// --- Firebase Path Management ---
const usePaths = () => useMemo(() => {
  if (!appId) return null;
  const basePath = `artifacts/${appId}/public/data`;
  return {
    gameDocRef: doc(db, basePath, 'game', 'state'),
    playersColRef: collection(db, basePath, 'players'),
    getPlayerDocRef: (uid) => doc(db, basePath, 'players', uid),
    categoriesColRef: collection(db, basePath, 'categories'),
    getCategoryDocRef: (id) => doc(db, basePath, 'categories', id),
    questionsColRef: collection(db, basePath, 'questions'),
    getQuestionDocRef: (id) => doc(db, basePath, 'questions', id),
    getSubmissionsColRef: (round) => collection(db, basePath, `round_${round}`),
    getSubmissionDocRef: (round, uid) => doc(db, basePath, `round_${round}`, uid),
  };
}, [appId]);


// --- Main App Component ---
export default function App() {
  const [view, setView] = useState('welcome');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const paths = usePaths();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        await signInAnonymously(auth).catch(err => console.error("Sign in failed", err));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading || !paths) return <Loader text="Connecting to game service..." />;

  switch (view) {
    case 'host':
      return <HostView user={user} paths={paths} setView={setView} />;
    case 'player':
      return <PlayerView user={user} paths={paths} />;
    default:
      return <WelcomeScreen setView={setView} />;
  }
}

// --- View Components ---

function WelcomeScreen({ setView }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight">Confidence Wager</h1>
        <p className="text-lg md:text-xl text-blue-400 mt-2">The game of bold guesses and risky bets</p>
      </div>
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-md">
        <button onClick={() => setView('host')} className="w-full bg-blue-600 hover:bg-blue-700 p-6 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 shadow-lg text-xl font-bold">
          <Crown className="h-8 w-8 mr-4" /> Host Game
        </button>
        <button onClick={() => setView('player')} className="w-full bg-green-600 hover:bg-green-700 p-6 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 shadow-lg text-xl font-bold">
          <Gamepad2 className="h-8 w-8 mr-4" /> Join as Player
        </button>
      </div>
    </div>
  );
}

function HostView({ user, paths, setView }) {
  const [hostPhase, setHostPhase] = useState('setup');
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState({ name: '', option1: '', option2: '' });
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({ term: '', correctAnswer: '' });
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [playerToRemove, setPlayerToRemove] = useState(null);

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const selectedCategory = useMemo(() => categories.find(c => c.id === selectedCategoryId), [categories, selectedCategoryId]);
  const isGameOver = gameState?.status === 'game-over';

  useEffect(() => {
    const q = query(paths.questionsColRef);
    const unsubQuestions = onSnapshot(q, (snapshot) => setQuestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubCategories = onSnapshot(paths.categoriesColRef, (snap) => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubGame = onSnapshot(paths.gameDocRef, (doc) => setGameState(doc.data()));
    const unsubPlayers = onSnapshot(paths.playersColRef, (snap) => setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubQuestions(); unsubCategories(); unsubGame(); unsubPlayers(); };
  }, [paths]);

  useEffect(() => {
    setNewQuestion({ term: '', correctAnswer: '' });
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!gameState || !gameState.round || gameState.status !== 'active') { setSubmissions([]); return; }
    const unsubSubs = onSnapshot(paths.getSubmissionsColRef(gameState.round), (snap) => setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsubSubs();
  }, [gameState?.round, gameState?.status, paths]);

  const addCategory = async () => {
    if (!newCategory.name || !newCategory.option1 || !newCategory.option2) return;
    await addDoc(paths.categoriesColRef, newCategory);
    setNewCategory({ name: '', option1: '', option2: '' });
  };

  const addQuestion = async () => {
    if (!newQuestion.term || !newQuestion.correctAnswer || !selectedCategory) return;
    await addDoc(paths.questionsColRef, {
      term: newQuestion.term,
      correctAnswer: newQuestion.correctAnswer,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
    });
    setNewQuestion({ term: '', correctAnswer: '' });
  };

  const deleteQuestion = async (id) => await deleteDoc(paths.getQuestionDocRef(id));
  const handleRemovePlayer = async () => {
    if (!playerToRemove) return;
    await deleteDoc(paths.getPlayerDocRef(playerToRemove.id));
    setPlayerToRemove(null);
  };

  const startGame = async () => {
    const groupedQuestions = questions.reduce((acc, q) => {
      if (!acc[q.categoryId]) acc[q.categoryId] = [];
      acc[q.categoryId].push(q);
      return acc;
    }, {});
    const shuffledCategoryIds = Object.keys(groupedQuestions).sort(() => Math.random() - 0.5);
    const playlist = shuffledCategoryIds.flatMap(catId => groupedQuestions[catId].sort(() => Math.random() - 0.5));

    const batch = writeBatch(db);
    batch.set(paths.gameDocRef, {
      hostId: user.uid, round: 0, status: 'waiting',
      playlist, playlistLength: playlist.length
    });
    players.forEach(player => batch.update(paths.getPlayerDocRef(player.id), { score: 0 }));
    await batch.commit();
    setHostPhase('gameplay');
    handleAdvanceRound(playlist);
  };

  const handleAdvanceRound = async (currentPlaylist) => {
    const playlist = currentPlaylist || gameState.playlist;
    const currentRound = gameState?.round || 0;

    if (currentRound >= playlist.length) {
      await setDoc(paths.gameDocRef, { ...gameState, status: 'game-over' }, { merge: true });
      return;
    }

    const prevQuestion = currentRound > 0 ? playlist[currentRound - 1] : null;
    const nextQuestion = playlist[currentRound];
    const category = categories.find(c => c.id === nextQuestion.categoryId);
    if (!category) return;

    const isNewCategory = !prevQuestion || prevQuestion.categoryId !== nextQuestion.categoryId;
    const status = isNewCategory ? 'category-splash' : 'active';

    const newState = {
      ...gameState, status,
      round: isNewCategory ? currentRound : currentRound + 1,
      currentCategory: { name: category.name, option1: category.option1, option2: category.option2 },
      currentQuestion: isNewCategory ? null : { ...nextQuestion, options: [category.option1, category.option2] },
      results: null
    };
    await setDoc(paths.gameDocRef, newState, { merge: true });
  };

  const startCategory = async () => {
    const currentRound = gameState.round;
    const question = gameState.playlist[currentRound];
    const category = categories.find(c => c.id === question.categoryId);

    await setDoc(paths.gameDocRef, {
      ...gameState, status: 'active',
      round: currentRound + 1,
      currentQuestion: { ...question, options: [category.option1, category.option2] },
    }, { merge: true });
  }

  const handleRevealAnswers = async () => {
    if (!gameState?.currentQuestion?.correctAnswer) return;
    const finalCorrectAnswer = gameState.currentQuestion.correctAnswer;

    try {
      await runTransaction(db, async (transaction) => {
        // --- Step 1: READ phase ---
        const playerDocPromises = submissions.map(sub => transaction.get(paths.getPlayerDocRef(sub.id)));
        const playerDocs = await Promise.all(playerDocPromises);

        const updates = [];
        const roundResults = [];

        // --- Step 2: Process data locally ---
        playerDocs.forEach((playerDoc, index) => {
          if (!playerDoc.exists()) return;

          const submission = submissions[index];
          const currentScore = playerDoc.data().score;
          const isCorrect = submission.guess === finalCorrectAnswer;
          const newScore = isCorrect ? currentScore + submission.wager : currentScore - submission.wager;

          updates.push({ ref: playerDoc.ref, newScore: newScore });
          roundResults.push({ playerId: submission.id, playerName: submission.playerName, guess: submission.guess, wager: submission.wager, isCorrect: isCorrect, scoreChange: isCorrect ? `+${submission.wager}` : `-${submission.wager}` });
        });

        // --- Step 3: WRITE phase ---
        updates.forEach(update => transaction.update(update.ref, { score: update.newScore }));
        transaction.update(paths.gameDocRef, { status: 'revealed', results: roundResults });
      });
    } catch (error) {
      console.error("Transaction failed: ", error);
      // Optionally, set an error state to show in the UI
    }
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => q.categoryId === selectedCategoryId)
  }, [questions, selectedCategoryId]);

  if (hostPhase === 'setup') {
    return (
      <div className="min-h-screen bg-gray-800 text-white p-4 md:p-8">
        <Modal isOpen={!!playerToRemove} onClose={() => setPlayerToRemove(null)} onConfirm={handleRemovePlayer} title="Remove Player">
          Are you sure you want to remove <span className="font-bold">{playerToRemove?.name}</span>?
        </Modal>
        <h1 className="text-4xl font-bold mb-6 text-blue-400">Host Setup</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-gray-900 p-6 rounded-xl">
              <h2 className="text-2xl font-semibold mb-3 flex items-center"><Layers className="mr-3 text-indigo-400" />Manage Categories</h2>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <input type="text" placeholder="Category Name" value={newCategory.name} onChange={e => setNewCategory({ ...newCategory, name: e.target.value })} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600" />
                <input type="text" placeholder="Option 1" value={newCategory.option1} onChange={e => setNewCategory({ ...newCategory, option1: e.target.value })} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600" />
                <input type="text" placeholder="Option 2" value={newCategory.option2} onChange={e => setNewCategory({ ...newCategory, option2: e.target.value })} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600" />
              </div>
              <button onClick={addCategory} className="w-full p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold">Add Category</button>
            </div>
            <div className="bg-gray-900 p-6 rounded-xl">
              <h2 className="text-2xl font-semibold mb-3 flex items-center"><BookOpen className="mr-3 text-green-400" />Add Questions</h2>
              <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600 mb-4" disabled={categories.length === 0}>
                <option value="">{categories.length > 0 ? 'Select a Category' : 'Create a category first'}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedCategory && <>
                <input type="text" placeholder="Question Term" value={newQuestion.term} onChange={e => setNewQuestion({ ...newQuestion, term: e.target.value })} className="w-full p-2 bg-gray-700 rounded-md border border-gray-600" />
                <div className="mt-4">
                  <p className="font-semibold mb-2">Correct Answer for "{newQuestion.term || '...'}" is:</p>
                  <div className="flex gap-x-6">
                    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-700 cursor-pointer"><input type="radio" name="correctAnswer" value={selectedCategory.option1} checked={newQuestion.correctAnswer === selectedCategory.option1} onChange={e => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })} className="form-radio h-5 w-5 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500" /> {selectedCategory.option1}</label>
                    <label className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-700 cursor-pointer"><input type="radio" name="correctAnswer" value={selectedCategory.option2} checked={newQuestion.correctAnswer === selectedCategory.option2} onChange={e => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })} className="form-radio h-5 w-5 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500" /> {selectedCategory.option2}</label>
                  </div>
                </div>
                <button onClick={addQuestion} className="w-full mt-4 p-2 bg-green-600 hover:bg-green-700 rounded-lg font-bold" disabled={!newQuestion.term || !newQuestion.correctAnswer}>Add Term to Category</button>
                <h3 className="text-xl font-semibold mt-6 mb-2">Terms in "{selectedCategory.name}" ({filteredQuestions.length})</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {filteredQuestions.map(q => (
                    <div key={q.id} className="bg-gray-700/50 p-2 rounded-lg flex justify-between items-center text-sm">
                      <span>{q.term}</span>
                      <button onClick={() => deleteQuestion(q.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </>}
            </div>
          </div>
          <div className="bg-gray-900 p-6 rounded-xl flex flex-col">
            <h2 className="text-2xl font-semibold mb-4">Players ({players.length})</h2>
            <div className="space-y-3 flex-grow overflow-y-auto pr-2 mb-4">
              {players.map(p => (
                <div key={p.id} className="bg-gray-700 p-2 rounded-lg flex justify-between items-center">
                  <div className="flex items-center gap-2"><PlayerIcon name={p.name} /><span className="font-semibold">{p.name}</span></div>
                  <button onClick={() => setPlayerToRemove(p)} className="text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
                </div>
              ))}
              {players.length === 0 && <p className="text-gray-500 text-center py-8">Waiting for players...</p>}
            </div>
            <button onClick={startGame} disabled={questions.length === 0} className="w-full p-4 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-xl disabled:bg-gray-600 disabled:cursor-not-allowed">Start Game</button>
            <button onClick={() => setView('welcome')} className="w-full mt-2 p-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold flex items-center justify-center"><ArrowLeft className="mr-2 h-4 w-4" /> Back</button>
          </div>
        </div>
      </div>
    );
  }

  // --- HOST GAMEPLAY VIEW ---
  if (!gameState) return <Loader text="Loading game..." />;
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {gameState.status === 'category-splash' ? (
            <div className="bg-gray-800 p-12 rounded-2xl shadow-lg text-center flex flex-col items-center justify-center h-full">
              <p className="text-2xl text-indigo-300">Up Next</p>
              <h1 className="text-6xl font-bold my-4">{gameState.currentCategory.name}</h1>
              <button onClick={startCategory} className="mt-6 p-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-xl">Start Category</button>
            </div>
          ) : (
            <>
              <div className="bg-gray-800 p-6 rounded-2xl shadow-lg text-center">
                <h1 className="text-3xl font-bold text-blue-400 mb-2">Host Dashboard</h1>
                <p className="text-gray-400">Question {gameState.round} of {gameState.playlistLength} | Status: <span className="font-bold">{gameState.status}</span></p>
                {gameState.currentQuestion?.categoryName && <p className="text-lg text-indigo-300 mt-1">Category: {gameState.currentQuestion.categoryName}</p>}

                {isGameOver ? (
                  <div className="my-6"><h2 className="text-4xl font-bold text-yellow-400">Game Over!</h2><button onClick={() => setHostPhase('setup')} className="mt-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold">New Game</button></div>
                ) : (
                  <div className="mt-6">
                    {gameState.status === 'active' ? (
                      <button onClick={handleRevealAnswers} disabled={submissions.length < players.length} className="p-4 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-xl transition-all disabled:bg-gray-600 disabled:opacity-50">Reveal Answers ({submissions.length}/{players.length})</button>
                    ) : ( // status is revealed, waiting, or category-splash
                      <button onClick={() => handleAdvanceRound()} className="p-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-xl transition-all">Next</button>
                    )}
                  </div>
                )}
              </div>
              <div className="bg-gray-800 p-6 rounded-2xl shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Live Submissions</h2>
                {gameState.status === 'active' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {players.map(p => {
                      const sub = submissions.find(s => s.id === p.id);
                      return (<div key={p.id} className={`p-3 rounded-lg text-center transition-colors ${sub ? 'bg-green-800' : 'bg-gray-700'}`}><p className="font-semibold truncate">{p.name}</p>{sub ? <p className="text-sm text-green-300">Wager: {sub.wager}</p> : <p className="text-sm text-gray-400">Waiting...</p>}</div>)
                    })}
                  </div>
                ) : <p className="text-gray-400 text-center">Round not active.</p>}
              </div>
            </>
          )}
        </div>
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg"><Scoreboard sortedPlayers={sortedPlayers} user={user} hostId={gameState?.hostId} /></div>
      </div>
    </div>
  );
}

function PlayerView({ user, paths }) {
  const [playerName, setPlayerName] = useState('');
  const [isPlayerNameSet, setIsPlayerNameSet] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [playerSubmission, setPlayerSubmission] = useState(null);
  const [selectedGuess, setSelectedGuess] = useState(null);
  const [selectedWager, setSelectedWager] = useState(3);
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(paths.gameDocRef, (doc) => setGameState(doc.exists() ? doc.data() : null));
    return () => unsub();
  }, [user, paths]);

  useEffect(() => {
    if (!gameState || !user || !gameState.round || gameState.status !== 'active') { setPlayerSubmission(null); return; };
    const unsub = onSnapshot(paths.getSubmissionDocRef(gameState.round, user.uid), (doc) => setPlayerSubmission(doc.data() || null));
    return () => unsub();
  }, [gameState?.round, gameState?.status, user, paths]);

  useEffect(() => {
    setSelectedGuess(null);
  }, [gameState?.round])

  const handleSetPlayerName = async () => {
    if (!nameInput.trim() || !user) { setError("Please enter a name."); return; }
    setError('');
    await setDoc(paths.getPlayerDocRef(user.uid), { name: nameInput.trim(), score: 0 }, { merge: true });
    setPlayerName(nameInput.trim());
    setIsPlayerNameSet(true);
  };

  const handleSubmitGuess = async () => {
    if (!selectedGuess || !user || !gameState || gameState.status !== 'active') return;
    await setDoc(paths.getSubmissionDocRef(gameState.round, user.uid), { playerName: playerName, guess: selectedGuess, wager: selectedWager });
  };

  if (!isPlayerNameSet) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center bg-gray-800 p-8 rounded-2xl shadow-lg">
          <h1 className="text-3xl font-bold text-green-400 mb-2">Join the Game</h1>
          <p className="text-gray-400 mb-6">Enter your name to play.</p>
          <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Your Name" className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg mb-4 text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          {error && <p className="text-red-400 mb-4">{error}</p>}
          <button onClick={handleSetPlayerName} className="w-full p-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition-all duration-200 flex items-center justify-center">Join <ArrowRight className="ml-2 h-5 w-5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-lg mx-auto">
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-blue-400">Confidence Wager</h1>
            <div className="text-right"><p className="font-semibold text-lg">{playerName}</p><p className="text-sm text-gray-400">Question {gameState?.round || 0} of {gameState?.playlistLength || '...'}</p></div>
          </div>

          {(!gameState || ['waiting', 'game-over'].includes(gameState.status)) && (
            <div className="text-center py-12"><h2 className="text-2xl font-semibold text-gray-300">{gameState?.status === 'game-over' ? 'Game Over!' : 'Waiting for the host to start...'}</h2></div>
          )}

          {gameState?.status === 'category-splash' && (
            <div className="text-center py-12">
              <p className="text-2xl text-indigo-300">Get Ready for</p>
              <h2 className="text-5xl font-bold my-4">{gameState.currentCategory.name}</h2>
            </div>
          )}

          {gameState?.status === 'active' && gameState.currentQuestion && (
            <div className="space-y-6">
              <div className="text-center py-8 px-4 bg-gray-900 rounded-xl">
                <p className="text-md text-indigo-300 mb-2">Category: {gameState.currentQuestion.categoryName}</p>
                <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">{gameState.currentQuestion.term}</h2>
              </div>
              {!playerSubmission ? (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    {gameState.currentQuestion.options.map(option => (
                      <button key={option} onClick={() => setSelectedGuess(option)} className={`w-full p-4 text-xl font-bold rounded-lg transition-all duration-200 ${selectedGuess === option ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-700 hover:bg-gray-600'}`}>{option}</button>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="wager" className="block text-lg font-medium mb-2 text-center">Wager: <span className="text-blue-400 font-bold text-2xl">{selectedWager}</span></label>
                    <input type="range" id="wager" min="1" max="5" value={selectedWager} onChange={(e) => setSelectedWager(Number(e.target.value))} className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg accent-blue-500" />
                  </div>
                  <button onClick={handleSubmitGuess} disabled={!selectedGuess} className="w-full p-4 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-xl transition-all disabled:bg-gray-600 disabled:cursor-not-allowed">Lock in Answer</button>
                </>
              ) : (
                <div className="text-center py-10 bg-gray-900 rounded-xl"><h3 className="text-2xl font-bold text-green-400">Answer Locked In!</h3><p className="text-gray-300 mt-2">Waiting for results...</p></div>
              )}
            </div>
          )}

          {gameState?.status === 'revealed' && gameState.results && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-center mb-4">Round Results</h2>
              <p className="text-center text-xl">Correct Answer: <span className="font-bold text-blue-400">{gameState.currentQuestion.correctAnswer}</span></p>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {gameState.results.map(res => (
                  <div key={res.playerId} className={`p-3 rounded-lg flex items-center justify-between ${res.isCorrect ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                    <div className="flex items-center gap-3">
                      {res.isCorrect ? <CheckCircle className="text-green-400 h-6 w-6" /> : <XCircle className="text-red-400 h-6 w-6" />}
                      <div><p className="font-semibold">{res.playerName}</p><p className="text-sm text-gray-400">Guessed: {res.guess} | Wagered: {res.wager}</p></div>
                    </div>
                    <p className={`font-bold text-lg ${res.isCorrect ? 'text-green-400' : 'text-red-400'}`}>{res.scoreChange}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Scoreboard({ sortedPlayers, user, hostId }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Scoreboard</h2>
      <div className="space-y-3">
        {sortedPlayers.map((player, index) => (
          <div key={player.id} className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
            <div className="flex items-center gap-4">
              <span className="font-bold w-8 text-center text-gray-400 text-lg">{index + 1}.</span>
              <PlayerIcon name={player.name} />
              <p className="font-semibold text-lg">{player.name} {user && player.id === user.id && '(You)'} {player.id === hostId && <Crown className="inline-block h-5 w-5 ml-1 text-yellow-400" />}</p>
            </div>
            <p className="font-bold text-blue-400 text-xl">{player.score}</p>
          </div>
        ))}
        {sortedPlayers.length === 0 && <p className="text-gray-400 text-center py-4">No players yet.</p>}
      </div>
    </div>
  );
}
