import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import LazadaAuth from "./pages/LazadaAuth.jsx";

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  return (
    <BrowserRouter basename="/">
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<LazadaAuth apiUrl={API_URL} />} />
          <Route path="/callback" element={<LazadaAuth apiUrl={API_URL} />} />
          <Route path="/dashboard" element={<Dashboard apiUrl={API_URL} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;