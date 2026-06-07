const API_URL = 'http://localhost:5000/api';

// --- INITIALIZATION SWITCH HANDLER ROUTE MAPS ---
window.addEventListener('DOMContentLoaded', () => {
  const userToken = localStorage.getItem('userToken');
  const applyFormCard = document.getElementById('applyFormCard');
  const authPromptCard = document.getElementById('authPromptCard');

  if (userToken) {
    if (applyFormCard) applyFormCard.style.display = 'block';
    if (authPromptCard) authPromptCard.style.display = 'none';
  } else {
    if (applyFormCard) applyFormCard.style.display = 'none';
    if (authPromptCard) authPromptCard.style.display = 'block';
  }

  // Auto-fetch listings if on public services directory screen
  if (document.getElementById('publicJobsGrid')) {
    fetchPublicJobs();
  }
});

// --- RENDER PUBLIC SERVICES PAGE JOBS SHEET ---
async function fetchPublicJobs() {
  const container = document.getElementById('publicJobsGrid');
  try {
    const response = await fetch(`${API_URL}/jobs`);
    const jobs = await response.json();
    container.innerHTML = jobs.length === 0 ? '<p style="color:#64748B;">No open positions listed at the moment.</p>' : '';
    
    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `
        <img src="http://localhost:5000${job.posterPath}" class="poster-img" alt="Job Poster">
        <div class="card-body">
          <span class="job-meta">📍 ${job.location}</span>
          <h3 class="job-title">${job.title}</h3>
          <p class="job-desc">${job.description}</p>
          <div class="job-salary">💰 ${job.salary}</div>
          <a href="apply.html" class="apply-action-btn">Apply For Position</a>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) { console.error("Error drawing public boards:", err); }
}

// --- ADMIN CONTROL WORKSPACE MANAGER (CANDIDATES + JOBS CRUD) ---
if (window.location.pathname.includes('dashboard.html')) {
  const adminToken = localStorage.getItem('adminToken');
  if (!adminToken) window.location.href = 'index.html';

  // Fetch initial collection array bundle
  async function fetchDashboardBundle() {
    // 1. Load Applicants
    try {
      const appRes = await fetch(`${API_URL}/admin/applicants`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (appRes.status === 401 || appRes.status === 403) {
        localStorage.removeItem('adminToken');
        window.location.href = 'index.html';
        return;
      }
      const applicants = await appRes.json();
      document.getElementById('totalCount').textContent = applicants.length;
      const tbody = document.getElementById('applicantsTableBody');
      tbody.innerHTML = '';
      
      applicants.forEach(app => {
        const tr = document.createElement('tr');
        
        const hasPhoto = !!app.photoPath;
        const profileImageSrc = hasPhoto ? `http://localhost:5000${app.photoPath}` : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        
        // Clean name mapping for the file signature
        const photoDownloadName = app.photoPath ? `${app.fullName.replace(/\s+/g, '_')}_photo.jpg` : 'default.jpg';

        tr.innerHTML = `
          <td>
            <div class="photo-cell" style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
              <img src="${profileImageSrc}" class="table-avatar" alt="Profile Photo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
              ${hasPhoto ? `<button type="button" onclick="forceDownloadPhoto('${profileImageSrc}', '${photoDownloadName}')" class="download-photo-btn" style="background:none; border:none; color:#F97316; font-weight:600; cursor:pointer; padding:0; font-size:0.75rem;">⬇ Download</button>` : '<span style="font-size:0.75rem; color:#94a3b8;">No Image</span>'}
            </div>
          </td>
          <td><b>${app.fullName}</b></td>
          <td>${app.email}</td>
          <td><span style="background:#f1f5f9; padding:0.25rem 0.5rem; border-radius:0.25rem;">${app.destinationCountry}</span></td>
          <td>${app.purpose}</td>
          <td><a href="http://localhost:5000${app.filePath}" target="_blank" class="view-link">📄 View Resume</a></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) { console.error("Error pulling applicants table: ", e); }

    // 2. Load Jobs into Admin Dashboard Panel
    fetchAdminJobsList();
  }

  async function fetchAdminJobsList() {
    const listContainer = document.getElementById('dashboardJobsList');
    try {
      const res = await fetch(`${API_URL}/jobs`);
      const jobs = await res.json();
      listContainer.innerHTML = '';
      
      jobs.forEach(job => {
        const row = document.createElement('div');
        row.className = 'dashboard-job-card';
        row.innerHTML = `
          <img src="http://localhost:5000${job.posterPath}">
          <div>
            <strong style="display:block;">${job.title}</strong>
            <span style="font-size:0.8rem; color:#64748B;">${job.location} | ${job.salary}</span>
          </div>
          <div class="job-actions">
            <button class="btn-action-edit" onclick="triggerJobEdit('${job._id}', '${escape(job.title)}', '${escape(job.description)}', '${escape(job.location)}', '${escape(job.salary)}')">Edit</button>
            <button class="btn-action-del" onclick="triggerJobDelete('${job._id}')">Delete</button>
          </div>
        `;
        listContainer.appendChild(row);
      });
    } catch (err) { console.error(err); }
  }

  // Hook into Dashboard Posting Submission Box
  const jobPostingForm = document.getElementById('jobPostingForm');
  if (jobPostingForm) {
    jobPostingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const jobId = document.getElementById('editingJobId').value;
      
      const formData = new FormData();
      formData.append('title', document.getElementById('jobTitle').value);
      formData.append('location', document.getElementById('jobLocation').value);
      formData.append('salary', document.getElementById('jobSalary').value);
      formData.append('description', document.getElementById('jobDescription').value);
      
      const fileInput = document.getElementById('jobPoster');
      if (fileInput.files.length > 0) {
        formData.append('jobPoster', fileInput.files[0]);
      }

      const endpoint = jobId ? `${API_URL}/jobs/${jobId}` : `${API_URL}/jobs`;
      const method = jobId ? 'PUT' : 'POST';

      try {
        const response = await fetch(endpoint, {
          method: method,
          headers: { 'Authorization': `Bearer ${adminToken}` },
          body: formData
        });
        const data = await response.json();
        if (data.success) {
          alert("🎉 " + data.message);
          jobPostingForm.reset();
          resetJobFormState();
          fetchAdminJobsList();
        }
      } catch (err) { alert("Server network error processing listing configuration."); }
    });
  }

  // Global triggers inside dashboard panel boundary context window
  window.triggerJobDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this job listing permanently?")) return;
    try {
      const res = await fetch(`${API_URL}/jobs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        alert("🗑️ Listing deleted from index arrays successfully!");
        fetchAdminJobsList();
      }
    } catch (e) { console.error(e); }
  };

  window.triggerJobEdit = (id, title, desc, loc, sal) => {
    document.getElementById('editingJobId').value = id;
    document.getElementById('jobTitle').value = unescape(title);
    document.getElementById('jobDescription').value = unescape(desc);
    document.getElementById('jobLocation').value = unescape(loc);
    document.getElementById('jobSalary').value = unescape(sal);
    
    document.getElementById('formPanelTitle').textContent = "✏️ Editing Posted Job Card";
    document.getElementById('jobSubmitBtn').textContent = "Save Updates Live 💾";
    document.getElementById('cancelEditBtn').style.display = "block";
  };

  const cancelEditBtn = document.getElementById('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', resetJobFormState);
  }

  function resetJobFormState() {
    document.getElementById('editingJobId').value = "";
    document.getElementById('formPanelTitle').textContent = "Publish New Job Poster";
    document.getElementById('jobSubmitBtn').textContent = "Publish Listing 🚀";
    document.getElementById('cancelEditBtn').style.display = "none";
    if (jobPostingForm) jobPostingForm.reset();
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('adminToken');
      window.location.href = 'index.html';
    });
  }

  fetchDashboardBundle();
}

// --- ADMIN SYSTEM CREDENTIAL VERIFICATION GATEWAY (index.html) ---
const adminLoginForm = document.getElementById('adminLoginForm');
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertMessage = document.getElementById('modalAlertMessageLogin');
    const adminId = document.getElementById('adminId').value;
    const adminPassword = document.getElementById('adminPassword').value;

    try {
      const response = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, adminPassword })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('adminToken', data.token);
        window.location.href = 'dashboard.html';
      } else {
        alertMessage.textContent = "❌ " + data.message;
        alertMessage.className = "error-banner";
      }
    } catch (err) { alertMessage.className = "error-banner"; }
  });
}

// --- APPLICANT INTERFACE PANELS (apply.html) ---
const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertMessage = document.getElementById('modalAlertMessageSignup');
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (data.success) {
        alertMessage.textContent = "🎉 Registered successfully! Switching tabs...";
        alertMessage.className = "success-banner";
        signupForm.reset();
        setTimeout(() => { showLogin(); }, 1500);
      } else {
        alertMessage.textContent = "❌ " + data.message;
        alertMessage.className = "error-banner";
      }
    } catch (e) { alertMessage.className = "error-banner"; }
  });
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertMessage = document.getElementById('modalAlertMessageLogin');
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('userToken', data.token);
        window.location.reload();
      } else {
        alertMessage.textContent = "❌ " + data.message;
        alertMessage.className = "error-banner";
      }
    } catch (e) { alertMessage.className = "error-banner"; }
  });
}

const applyForm = document.getElementById('applyForm');
if (applyForm) {
  applyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertMessage = document.getElementById('alertMessage');
    const token = localStorage.getItem('userToken');
    const formData = new FormData();
    
    formData.append('fullName', document.getElementById('fullName').value);
    formData.append('email', document.getElementById('email').value);
    formData.append('phone', document.getElementById('phone').value);
    formData.append('destinationCountry', document.getElementById('destinationCountry').value);
    formData.append('purpose', document.getElementById('purpose').value);
    
    const resumeInput = document.getElementById('resumeFile');
    if (resumeInput && resumeInput.files.length > 0) {
      formData.append('resumeFile', resumeInput.files[0]);
    }

    const photoInput = document.getElementById('photoFile');
    if (photoInput && photoInput.files.length > 0) {
      formData.append('candidatePhoto', photoInput.files[0]);
    }

    try {
      const response = await fetch(`${API_URL}/applicants`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        alertMessage.textContent = "🎉 Application & Photo uploaded successfully!";
        alertMessage.className = "success-banner";
        applyForm.reset();
      } else {
        alertMessage.textContent = "❌ Submission failed: " + data.message;
        alertMessage.className = "error-banner";
      }
    } catch (err) { 
      alertMessage.textContent = "❌ Network communication error occurred.";
      alertMessage.className = "error-banner"; 
    }
  });
}

const logoutUserBtn = document.getElementById('logoutUserBtn');
if (logoutUserBtn) {
  logoutUserBtn.addEventListener('click', () => {
    localStorage.removeItem('userToken');
    window.location.reload();
  });
}

// --- GLOBAL WORKSPACE UTILITY FOR COR-ENABLED IMAGE DOWNLOADS ---
window.forceDownloadPhoto = async function(imageUrl, fileName) {
  try {
    // Explicitly requests a fresh network blob bypass check
    const response = await fetch(imageUrl, { method: 'GET', mode: 'cors' });
    const blob = await response.blob(); 
    const blobUrl = window.URL.createObjectURL(blob);
    
    const tempLink = document.createElement('a');
    tempLink.href = blobUrl;
    tempLink.download = fileName;
    
    document.body.appendChild(tempLink);
    tempLink.click(); 
    
    document.body.removeChild(tempLink);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Direct download block caught, using multi-window fallback:", error);
    window.open(imageUrl, '_blank');
  }
};