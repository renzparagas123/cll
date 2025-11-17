import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./Auth/Login.jsx";
import ForgotPassword from "./Auth/ForgotPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <Routes>

          {/*Auth*/}
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/*Dashboard*/}
          <Route path="/dashboard" element={<Dashboard />} />

        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
