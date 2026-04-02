// Authentication Script - Connected to Backend API
console.log('Auth script loaded - Connected to Campus Connect API');

const API_URL = '/api';
let authInitialized = false;

document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
});

function initializeAuth() {
    if (authInitialized) return;
    authInitialized = true;

    console.log('Initializing auth listeners...');
    const loginForm = document.getElementById('loginFormSubmit');
    const signupForm = document.getElementById('signupFormSubmit');

    if (loginForm) {
        console.log('Login form found, adding listener');
        loginForm.addEventListener('submit', handleLogin);
    }
    if (signupForm) {
        console.log('Signup form found, adding listener');
        signupForm.addEventListener('submit', handleSignup);
    }

    const signupPassword = document.getElementById('signupPassword');
    if (signupPassword) signupPassword.addEventListener('input', validatePassword);

    const confirmPassword = document.getElementById('confirmPassword');
    if (confirmPassword) confirmPassword.addEventListener('input', checkPasswordMatch);
}

function setAuthButtonLabel(button, label) {
    if (!button) return;

    const labelNode = button.querySelector('span');
    if (labelNode) {
        labelNode.textContent = label;
        return;
    }

    button.textContent = label;
}

function getSubmitButton(form) {
    return form?.querySelector('.primary-btn, .btn-primary, button[type="submit"]') || null;
}

// Show/Hide Forms
function showLogin() {
    document.getElementById('signupForm').classList.remove('active');
    setTimeout(() => {
        document.getElementById('loginForm').classList.add('active');
        if (typeof feather !== 'undefined') feather.replace();
    }, 100);
}

function showSignup() {
    document.getElementById('loginForm').classList.remove('active');
    setTimeout(() => {
        document.getElementById('signupForm').classList.add('active');
        if (typeof feather !== 'undefined') feather.replace();
    }, 100);
}

// Toggle Password Visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const wrapper = input.closest('.password-wrapper') || input.closest('.input-wrapper');
    const icon = wrapper?.querySelector('.toggle-password i, .toggle-pwd i');
    if (!icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-feather', 'eye-off');
    } else {
        input.type = 'password';
        icon.setAttribute('data-feather', 'eye');
    }
    if (typeof feather !== 'undefined') feather.replace();
}

// Password Validation
function validatePassword() {
    const password = document.getElementById('signupPassword').value;
    // Removed requirement toggles as they are not in auth.html
    checkPasswordMatch();
}

function toggleReq(id, valid) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('valid', valid);
}

function checkPasswordMatch() {
    const password = document.getElementById('signupPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    if (!password || !confirmPassword) return;
    if (confirmPassword.value.length > 0) {
        confirmPassword.style.borderColor = password.value === confirmPassword.value ? '#10b981' : '#ef4444';
    } else {
        confirmPassword.style.borderColor = '#e2e8f0';
    }
}

// Handle Login - calls real backend API
async function handleLogin(e) {
    e.preventDefault();
    console.log('Login form submit triggered');
    const form = e.target;
    const submitBtn = getSubmitButton(form);
    const identifier = form.querySelector('[name="identifier"]').value.trim();
    const password = form.querySelector('[name="password"]').value;

    if (!identifier || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    submitBtn.disabled = true;
    setAuthButtonLabel(submitBtn, 'Signing in...');

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // Save auth data to localStorage
        localStorage.setItem('token', data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));
        localStorage.setItem('isAuthenticated', 'true');

        showNotification('Login successful! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed. Please try again.', 'error');
        submitBtn.disabled = false;
        setAuthButtonLabel(submitBtn, 'Sign In');
    }
}

// Handle Signup - calls real backend API
async function handleSignup(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = getSubmitButton(form);

    const firstName = form.querySelector('[name="firstName"]').value.trim();
    const lastName = form.querySelector('[name="lastName"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const studentId = form.querySelector('[name="studentId"]').value.trim();
    const contact = form.querySelector('[name="contact"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const confirmPassword = form.querySelector('[name="confirmPassword"]').value;
    const termsAccepted = form.querySelector('[name="terms"]').checked;

    console.log('Signup attempt:', { firstName, lastName, email, studentId });

    if (!firstName || !lastName || !email || !studentId || !contact || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    if (!termsAccepted) {
        showNotification('Please accept the Terms of Service', 'error');
        return;
    }
    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    if (password.length < 8) {
        showNotification('Password must be at least 8 characters', 'error');
        return;
    }

    submitBtn.disabled = true;
    setAuthButtonLabel(submitBtn, 'Creating Account...');

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, studentId, contact, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }

        // Save auth data to localStorage
        localStorage.setItem('token', data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));
        localStorage.setItem('isAuthenticated', 'true');

        showNotification('Account created successfully! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);

    } catch (error) {
        console.error('Signup error:', error);
        showNotification(error.message || 'Registration failed. Please try again.', 'error');
        submitBtn.disabled = false;
        setAuthButtonLabel(submitBtn, 'Create Account');
    }
}

// Notification helper
function showNotification(message, type = 'info') {
    const existing = document.querySelectorAll('.auth-notification');
    existing.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = 'auth-notification';
    notification.style.cssText = `
        position: fixed; top: 2rem; right: 2rem;
        background: ${type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' :
                      type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' :
                      'linear-gradient(135deg, #6366f1, #4f46e5)'};
        color: white; padding: 1rem 1.5rem; border-radius: 12px;
        font-weight: 600; font-size: 0.875rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 9999; animation: slideInRight 0.4s ease; max-width: 400px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.4s ease';
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

// CSS animations for notifications
if (!document.getElementById('auth-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'auth-notification-styles';
    style.textContent = `
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
}
