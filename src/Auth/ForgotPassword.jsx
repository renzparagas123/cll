import { useState } from "react";

export default function ForgotPassword() {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-500 to-blue-700 dark:from-gray-900 dark:to-black p-4 transition">

        {/* Card */}
        <div className="w-full max-w-md bg-white/20 dark:bg-white/10 backdrop-blur-xl shadow-2xl rounded-3xl p-8 border border-white/30 dark:border-white/20 transition relative">

          {/* Dark Mode Button */}
          <button
            onClick={() => setDark(!dark)}
            className="absolute top-5 right-5 text-white bg-black/30 backdrop-blur-sm px-3 py-1 rounded-xl hover:bg-black/40 transition"
          >
            {dark ? "Light" : "Dark"}
          </button>

          {/* Title */}
          <h1 className="text-3xl font-bold text-center text-white mb-2">Forgot Password</h1>
          <p className="text-center text-gray-200 mb-8">
            Enter your email to reset your password
          </p>

          <form className="space-y-5">

            {/* Email field */}
            <div>
              <label className="block mb-1 font-medium text-white">Email</label>
              <input
                type="email"
                placeholder="your@email.com"
                className="w-full p-3 rounded-xl bg-white/30 text-white placeholder-white/70 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            {/* Reset Button */}
            <button
              type="submit"
              className="w-full bg-blue-600/80 text-white p-3 rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition"
            >
              Send Reset Link
            </button>

          </form>

          {/* Back to login */}
          <p className="text-center text-white/90 mt-6 text-sm">
            Remember your password?{" "}
            <a href="/" className="underline font-medium">Login</a>
          </p>
        </div>
      </div>
    </div>
  );
}
