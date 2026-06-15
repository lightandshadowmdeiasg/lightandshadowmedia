/* ============================================
   LIGHT & SHADOW MEDIA - MAIN JAVASCRIPT
   ============================================ */

   document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modules
    Navigation.init();
    ScrollAnimations.init();
    Modal.init();
    ContactForm.init();
    
    // Initialize page-specific modules
    if (document.querySelector('.projects-grid[data-source]')) {
        ProjectLoader.init();
    }

    if (document.querySelector('.video-scroller[data-source]')) {
        VideoScroller.init();
    }

    if (document.querySelector('.editorial-videos[data-source]')) {
        EditorialVideos.init();
    }

    if (document.querySelector('.hero-video[data-source]')) {
        HeroVideo.init();
    }
});

/* ============================================
   NAVIGATION MODULE
   ============================================ */
const Navigation = {
    navbar: null,
    menuToggle: null,
    navMobile: null,
    
    init() {
        this.navbar = document.querySelector('.navbar');
        this.menuToggle = document.querySelector('.menu-toggle');
        this.navMobile = document.querySelector('.nav-mobile');
        
        if (!this.navbar) return;
        
        this.bindEvents();
        this.handleScroll();
        this.setActiveLink();
    },
    
    bindEvents() {
        // Scroll event for navbar background
        window.addEventListener('scroll', () => this.handleScroll());
        
        // Mobile menu toggle
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }
        
        // Close mobile menu on link click
        if (this.navMobile) {
            this.navMobile.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    this.closeMobileMenu();
                });
            });
        }
        
        // Close mobile menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMobileMenu();
            }
        });
    },
    
    handleScroll() {
        if (window.scrollY > 50) {
            this.navbar.classList.add('scrolled');
        } else {
            this.navbar.classList.remove('scrolled');
        }
    },
    
    toggleMobileMenu() {
        this.menuToggle.classList.toggle('active');
        this.navMobile?.classList.toggle('active');
        document.body.style.overflow = this.navMobile?.classList.contains('active') ? 'hidden' : '';
    },
    
    closeMobileMenu() {
        this.menuToggle?.classList.remove('active');
        this.navMobile?.classList.remove('active');
        document.body.style.overflow = '';
    },
    
    setActiveLink() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        // Set active on desktop nav
        document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPage || (currentPage === '' && href === 'index.html')) {
                link.classList.add('active');
            } else if (!href.startsWith('#')) {
                link.classList.remove('active');
            }
        });
    }
};

/* ============================================
   SCROLL ANIMATIONS MODULE
   ============================================ */
const ScrollAnimations = {
    elements: [],
    
    init() {
        this.elements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .stagger-item');
        
        if (this.elements.length === 0) return;
        
        // Use Intersection Observer for scroll animations
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });
        
        this.elements.forEach(el => observer.observe(el));
        
        // Stagger animations for grid items
        this.initStaggerAnimations();
    },
    
    initStaggerAnimations() {
        const staggerContainers = document.querySelectorAll('.projects-grid, .services-grid');
        
        staggerContainers.forEach(container => {
            const items = container.children;
            
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    Array.from(items).forEach((item, index) => {
                        setTimeout(() => {
                            item.classList.add('visible');
                        }, index * 100);
                    });
                    observer.unobserve(container);
                }
            }, {
                threshold: 0.1
            });
            
            observer.observe(container);
        });
    }
};

/* ============================================
   MODAL MODULE
   ============================================ */
const Modal = {
    modal: null,
    videoContainer: null,
    titleEl: null,
    metaEl: null,
    descriptionEl: null,
    awardsEl: null,
    
    init() {
        this.modal = document.getElementById('videoModal');
        if (!this.modal) return;
        
        this.videoContainer = this.modal.querySelector('.modal-video');
        this.titleEl = this.modal.querySelector('.modal-info h3');
        this.metaEl = this.modal.querySelector('.modal-meta');
        this.descriptionEl = this.modal.querySelector('.modal-info > p');
        this.awardsEl = this.modal.querySelector('.modal-awards');
        
        this.bindEvents();
    },
    
    bindEvents() {
        // Close button
        const closeBtn = this.modal.querySelector('.modal-close');
        closeBtn?.addEventListener('click', () => this.close());
        
        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    },
    
    open(data) {
        // Set video — supports YouTube and Google Drive links
        const videoSource = data.videoUrl || data.driveLink || '';
        const driveId = this.extractDriveId(videoSource);
        const ytId    = this.extractYouTubeId(videoSource);

        if (driveId) {
            this.videoContainer.innerHTML = `
                <iframe
                    src="https://drive.google.com/file/d/${driveId}/preview"
                    allow="autoplay; encrypted-media"
                    allowfullscreen>
                </iframe>
            `;
        } else if (ytId) {
            this.videoContainer.innerHTML = `
                <iframe 
                    src="https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        } else {
            this.videoContainer.innerHTML = `
                <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);">
                    Video coming soon
                </div>
            `;
        }
        
        // Set info
        if (this.titleEl) this.titleEl.textContent = data.title || 'Untitled';
        
        if (this.metaEl) {
            const meta = [];
            if (data.client) meta.push(data.client);
            if (data.year) meta.push(data.year);
            if (data.role) meta.push(data.role);
            if (data.venue) meta.push(data.venue);
            if (data.date) meta.push(new Date(data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
            this.metaEl.textContent = meta.join(' • ');
        }
        
        if (this.descriptionEl) this.descriptionEl.textContent = data.description || '';
        
        // Awards
        if (this.awardsEl) {
            if (data.awards && data.awards.length > 0) {
                this.awardsEl.innerHTML = data.awards.map(award => `
                    <span>
                        <svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                        ${award}
                    </span>
                `).join('');
                this.awardsEl.style.display = 'block';
            } else {
                this.awardsEl.style.display = 'none';
            }
        }
        
        // Show modal
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },
    
    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Clear video to stop playback
        setTimeout(() => {
            this.videoContainer.innerHTML = '';
        }, 300);
    },
    
    extractDriveId(url) {
        if (!url) return null;
        // https://drive.google.com/file/d/FILE_ID/view
        const m1 = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
        if (m1) return m1[1];
        // https://drive.google.com/open?id=FILE_ID
        const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
        if (m2) return m2[1];
        // https://drive.google.com/uc?id=FILE_ID
        const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
        if (m3) return m3[1];
        return null;
    },

    extractYouTubeId(url) {
        if (!url) return null;
      
        try {
          const parsed = new URL(url);
      
          // youtu.be/ID
          if (parsed.hostname === 'youtu.be') {
            return parsed.pathname.slice(1);
          }
      
          // youtube.com/watch?v=ID
          if (parsed.searchParams.has('v')) {
            return parsed.searchParams.get('v');
          }
      
          // youtube.com/shorts/ID
          if (parsed.pathname.includes('/shorts/')) {
            return parsed.pathname.split('/shorts/')[1].split(/[?&]/)[0];
          }
      
        } catch (e) {
          // fallback regex (for malformed URLs)
          const match = url.match(
            /(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/
          );
          return match ? match[1] : null;
        }
      
        return null;
      }
      
};

/* ============================================
   FALLBACK DATA (for local file:// viewing)
   ============================================ */
const FallbackData = {
    'data/live-events.json': {
        events: [
            { id: "event-001", title: "TechCorp Annual Summit 2025", date: "2025-03-15", venue: "Marina Bay Sands", description: "Multi-camera live coverage for 2000+ attendees with real-time switching, LED wall content, and simultaneous streaming.", thumbnail: "", videoUrl: "", status: "upcoming" },
            { id: "event-002", title: "Singapore Music Festival 2024", date: "2024-11-20", venue: "Esplanade", description: "Full concert documentation including multi-angle coverage, backstage footage, and promotional recap videos.", thumbnail: "", videoUrl: "", status: "completed" },
            { id: "event-003", title: "AWS re:Invent Singapore", date: "2024-09-10", venue: "Suntec Convention Centre", description: "Technical conference coverage with 6 cameras, presentation capture, and same-day highlight reels.", thumbnail: "", videoUrl: "", status: "completed" },
            { id: "event-004", title: "Charity Gala Night 2025", date: "2025-02-28", venue: "Raffles Hotel", description: "Elegant coverage of the annual charity dinner including red carpet interviews and auction highlights.", thumbnail: "", videoUrl: "", status: "upcoming" },
            { id: "event-005", title: "FinTech Summit Asia", date: "2024-08-15", venue: "Marina Bay Sands Expo", description: "Two-day conference with keynote captures, panel discussions, and networking event coverage.", thumbnail: "", videoUrl: "", status: "completed" },
            { id: "event-006", title: "National Day Parade Preview", date: "2024-08-01", venue: "The Float @ Marina Bay", description: "Official documentation of NDP rehearsals including aerial coverage and behind-the-scenes moments.", thumbnail: "", videoUrl: "", status: "completed" }
        ]
    },
    'data/corporate.json': {
        projects: [
            { id: "corp-001", title: "DBS Bank — Brand Story", client: "DBS Bank", year: 2024, description: "A cinematic brand film showcasing DBS's digital transformation journey and commitment to innovation.", thumbnail: "", videoUrl: "", category: "brand" },
            { id: "corp-002", title: "Grab — Human Stories", client: "Grab", year: 2024, description: "Documentary-style series highlighting the personal stories of Grab driver-partners across Southeast Asia.", thumbnail: "", videoUrl: "", category: "brand" },
            { id: "corp-003", title: "Shopee 11.11 Launch", client: "Shopee", year: 2024, description: "High-energy product launch video with dynamic graphics, celebrity appearances, and rapid-fire deal showcases.", thumbnail: "", videoUrl: "", category: "product" },
            { id: "corp-004", title: "Singapore Airlines — Premium Experience", client: "Singapore Airlines", year: 2024, description: "Luxury brand film highlighting the first-class experience with cinematic visuals.", thumbnail: "", videoUrl: "", category: "brand" },
            { id: "corp-005", title: "CapitaLand — CEO Message", client: "CapitaLand", year: 2024, description: "Annual shareholder address with professional studio setup and corporate brand integration.", thumbnail: "", videoUrl: "", category: "internal" },
            { id: "corp-006", title: "Razer — Gaming Mouse Launch", client: "Razer", year: 2023, description: "Product showcase video with macro photography, dynamic lighting, and technical feature breakdowns.", thumbnail: "", videoUrl: "", category: "product" }
        ]
    },
    'data/films.json': {
        films: [
            { id: "film-001", title: "The Last Light", year: 2024, role: "Cinematography", description: "Award-winning short film exploring themes of memory and identity in modern Singapore.", thumbnail: "", videoUrl: "", awards: ["Best Cinematography — Singapore Film Festival 2024"], category: "short", type: "short" },
            { id: "film-002", title: "Echoes of the Sea", year: 2024, role: "Director & Cinematography", description: "Feature documentary exploring the changing relationship between coastal communities and the ocean.", thumbnail: "", videoUrl: "", awards: ["Official Selection — Asian Documentary Film Festival 2024"], category: "documentary", type: "documentary" },
            { id: "film-003", title: "Kopitiam Stories", year: 2024, role: "Director", description: "Narrative short set in a traditional Singaporean coffee shop, weaving together three generations.", thumbnail: "", videoUrl: "", awards: [], category: "short", type: "short" },
            { id: "film-004", title: "Silent Frequencies", year: 2023, role: "Cinematography", description: "Experimental narrative exploring communication and isolation in the digital age.", thumbnail: "", videoUrl: "", awards: ["Jury Prize — Hong Kong Film Festival 2023"], category: "narrative", type: "narrative" },
            { id: "film-005", title: "The Craftsmen", year: 2023, role: "Director & Cinematography", description: "Documentary series profiling traditional craftspeople in Southeast Asia.", thumbnail: "", videoUrl: "", awards: ["Best Short Film — ASEAN Film Awards 2023"], category: "documentary", type: "documentary" },
            { id: "film-006", title: "Neon Nights", year: 2023, role: "Cinematography", description: "Neo-noir narrative short set in the streets of Singapore. A story of redemption.", thumbnail: "", videoUrl: "", awards: [], category: "narrative", type: "narrative" }
        ]
    }
};

/* ============================================
   THUMBNAIL URL RESOLVER
   ============================================================ */

// Converts Google Drive share links to direct-embeddable thumbnail URLs
function resolveThumbUrl(url) {
    if (!url) return '';
    url = url.trim();

    // Already a direct thumbnail URL — return as-is
    if (url.includes('drive.google.com/thumbnail')) return url;

    // https://drive.google.com/file/d/FILE_ID/view
    const m1 = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
    if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}=w800`;

    // https://drive.google.com/open?id=FILE_ID
    const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=w800`;

    // https://drive.google.com/uc?export=view&id=FILE_ID  or  uc?id=FILE_ID
    const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
    if (m3) return `https://lh3.googleusercontent.com/d/${m3[1]}=w800`;

    // https://drive.google.com/thumbnail?id=FILE_ID  (already formatted)
    const m4 = url.match(/drive\.google\.com\/thumbnail\?.*id=([^&]+)/);
    if (m4) return `https://lh3.googleusercontent.com/d/${m4[1]}=w800`;

    // Return as-is for normal URLs and relative paths
    return url;
}

/*  ============================================================
   PROJECT LOADER MODULE
   ============================================ */
const ProjectLoader = {
    grid: null,
    source: null,
    filterTabs: null,
    currentFilter: 'upcoming',
    data: null,
    
    async init() {
        this.grid = document.querySelector('.projects-grid[data-source]');
        if (!this.grid) return;
        
        this.source = this.grid.dataset.source;
        this.filterTabs = document.querySelectorAll('.filter-tab');
        
        this.bindEvents();
        await this.loadData();
    },
    
    bindEvents() {
        this.filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentFilter = tab.dataset.filter;
                this.filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.render();
            });
        });
    },
    
    async loadData() {
        this.showLoading();
        
        try {
            const response = await fetch(this.source);
            if (!response.ok) throw new Error('Failed to load data');
            
            const json = await response.json();
            
            // Handle different JSON structures
            this.data = json.events || json.projects || json.films || json.videos || [];

            // Sort live events by date — latest first
            if (this.source && (this.source.indexOf('live-events') !== -1 || this.source.indexOf('workers.dev/events') !== -1)) {
                this.data.sort((a, b) => {
                    const da = a.date ? new Date(a.date).getTime() : 0;
                    const db = b.date ? new Date(b.date).getTime() : 0;
                    return db - da; // descending — latest first
                });
            }
            this.render();
        } catch (error) {
            console.error('Error loading projects from JSON, using fallback data:', error);
            
            // Use fallback data for local file:// viewing
            const fallback = FallbackData[this.source];
            if (fallback) {
                this.data = fallback.events || fallback.projects || fallback.films || [];
                this.render();
            } else {
                this.showError();
            }
        }
    },
    
    render() {
        if (!this.data || this.data.length === 0) {
            this.showEmpty();
            return;
        }

        let filteredData = this.data;

        // Apply filter if not 'all'
        if (this.currentFilter !== 'all') {
            filteredData = this.data.filter(item => {
                return item.status === this.currentFilter ||
                       item.category === this.currentFilter ||
                       item.type === this.currentFilter;
            });
        }

        if (filteredData.length === 0) {
            this.showEmpty();
            return;
        }

        // Render cards
        this.grid.innerHTML = filteredData
            .map((item, index) => this.createCard(item, index))
            .join('');

        // Bind click events to cards + booking buttons
        this.grid.querySelectorAll('.project-card, .event-list-card').forEach((card, index) => {
            const item = filteredData[index];

            // Whole card → open video modal (same as before)
            card.addEventListener('click', () => {
                if (typeof Modal !== 'undefined') {
                    Modal.open(item);
                }
            });

            // "Book Seat" button (if present)
            const bookBtn = card.querySelector('.js-open-booking');
            if (bookBtn) {
                bookBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = `booking.html?eventId=${encodeURIComponent(item.id)}`;
                    window.location.href = url;
                });
            }

        });

        // Stagger animation
        setTimeout(() => {
            this.grid.querySelectorAll('.project-card, .event-list-card').forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('visible');
                }, index * 100);
            });
        }, 100);
    },

    
    createCard(item, index) {
        const category = item.client || item.venue || item.role || item.status || 'Project';
        const year = item.year || (item.date ? new Date(item.date).getFullYear() : '');

        // Show booking button only on the Live Events page
        const isLiveEvents = this.source && (
            this.source.indexOf('live-events') !== -1 ||
            this.source.indexOf('workers.dev/events') !== -1
        );
        const isBookable = isLiveEvents && (item.bookingStatus === 'open' || item.status === 'upcoming');

        // ── LIVE EVENTS: horizontal card layout ──────────────────────
        if (isLiveEvents) {
            const thumbUrl = resolveThumbUrl(item.thumbnail);
            const statusLabel = item.bookingStatus === 'open'
                ? `<span class="ev-badge ev-badge-open">Bookings Open</span>`
                : `<span class="ev-badge ev-badge-closed">Bookings Closed</span>`;

            const bookingButton = isBookable ? `
                <button class="btn btn-primary js-open-booking" type="button" style="margin-top:auto;align-self:flex-start;">
                    Book Seat
                </button>` : '';

            return `
            <article class="event-list-card stagger-item" data-index="${index}">
                <div class="elc-thumb">
                    ${thumbUrl
                        ? `<img src="${thumbUrl}" alt="${item.title}" loading="lazy"
                            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                        : ''}
                    <div class="elc-thumb-placeholder" style="${thumbUrl ? 'display:none' : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <rect x="2" y="2" width="20" height="20" rx="2"/>
                            <circle cx="8" cy="8" r="2"/>
                            <path d="M2 15l5-5 4 4 5-5 6 6"/>
                        </svg>
                    </div>
                </div>
                <div class="elc-body">
                    <div class="elc-meta">
                        <span class="project-category">${category}${year ? ` • ${year}` : ''}</span>
                        ${statusLabel}
                    </div>
                    <h3 class="elc-title">${item.title.split('|').map(s => s.trim()).join('<br>')}</h3>
                    <p class="elc-desc">${item.description || ''}</p>
                    ${bookingButton}
                </div>
                ${(item.videoUrl || item.driveLink) ? `
                    <div class="project-play-btn">
                        <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></polygon></svg>
                    </div>` : ''}
            </article>`;
        }

        // ── DEFAULT: original grid card layout ───────────────────────
        return `
            <article class="project-card stagger-item" data-index="${index}">
                ${item.thumbnail ?
                    `<img src="${resolveThumbUrl(item.thumbnail)}" alt="${item.title}" class="project-card-image" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='flex')">
                    <div class="project-card-placeholder" style="display:none;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <rect x="2" y="2" width="20" height="20" rx="2"/>
                            <circle cx="8" cy="8" r="2"/>
                            <path d="M2 15l5-5 4 4 5-5 6 6"/>
                        </svg>
                    </div>` :
                    `<div class="project-card-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <rect x="2" y="2" width="20" height="20" rx="2"/>
                            <circle cx="8" cy="8" r="2"/>
                            <path d="M2 15l5-5 4 4 5-5 6 6"/>
                        </svg>
                    </div>`
                }
                <div class="project-card-overlay">
                    <span class="project-category">${category}${year ? ` • ${year}` : ''}</span>
                    <h3>${item.title}</h3>
                    <p>${item.description || ''}</p>
                </div>
                ${(item.videoUrl || item.driveLink) ? `
                    <div class="project-play-btn">
                        <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></polygon></svg>
                    </div>
                ` : ''}
            </article>
        `;
    }
    ,
    
    showLoading() {
        this.grid.innerHTML = `
            <div class="loading" style="grid-column: 1 / -1;">
                <div class="loading-spinner"></div>
                <span>Loading projects...</span>
            </div>
        `;
    },
    
    showError() {
        this.grid.innerHTML = `
            <div class="loading" style="grid-column: 1 / -1;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>Unable to load projects. Please try again later.</span>
            </div>
        `;
    },
    
    showEmpty() {
        this.grid.innerHTML = `
            <div class="loading" style="grid-column: 1 / -1;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                </svg>
                <span>No projects found for this filter.</span>
            </div>
        `;
    }
};

/* ============================================
   VIDEO SCROLLER MODULE
   Horizontal scrolling video gallery — embeds play inline
   ============================================ */
const VideoScroller = {
    container: null,
    source: null,

    async init() {
        this.container = document.querySelector('.video-scroller[data-source]');
        if (!this.container) return;
        this.source = this.container.dataset.source;
        await this.load();
    },

    extractDriveId(url) {
        if (!url) return null;
        const m1 = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
        if (m1) return m1[1];
        const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
        if (m2) return m2[1];
        const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
        if (m3) return m3[1];
        return null;
    },

    extractYouTubeId(url) {
        if (!url) return null;
        try {
            const p = new URL(url);
            if (p.hostname === 'youtu.be') return p.pathname.slice(1);
            if (p.searchParams.has('v')) return p.searchParams.get('v');
            if (p.pathname.includes('/shorts/')) return p.pathname.split('/shorts/')[1].split(/[?&]/)[0];
        } catch (e) {
            const m = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }
        return null;
    },

    embedSrc(video) {
        const src = video.driveLink || video.videoUrl || '';
        const driveId = this.extractDriveId(src);
        if (driveId) return `https://drive.google.com/file/d/${driveId}/preview`;
        const ytId = this.extractYouTubeId(src);
        if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0`;
        return null;
    },

    async load() {
        try {
            const res = await fetch(this.source);
            if (!res.ok) throw new Error('Failed to load videos');
            const json = await res.json();
            const videos = json.videos || [];
            this.render(videos);
        } catch (e) {
            console.error('VideoScroller load error:', e);
            this.container.innerHTML = `<div class="loading"><span>Unable to load videos. Please try again later.</span></div>`;
        }
    },

    render(videos) {
        if (!videos.length) {
            this.container.innerHTML = `<div class="loading"><span>No videos yet. Check back soon.</span></div>`;
            return;
        }

        this.container.innerHTML = videos.map(v => {
            const src  = this.embedSrc(v);
            const meta = [v.client, v.year].filter(Boolean).join(' • ');
            const frame = src
                ? `<div class="video-card__frame"><iframe src="${src}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe></div>`
                : `<div class="video-card__frame"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);">Video coming soon</div></div>`;
            return `
                <div class="video-card">
                    <h3 class="video-card__title">${v.title || 'Untitled'}</h3>
                    ${frame}
                    ${meta ? `<div class="video-card__meta">${meta}</div>` : ''}
                    ${v.description ? `<p class="video-card__desc">${v.description}</p>` : ''}
                </div>`;
        }).join('');
    }
};

/* ============================================
   EDITORIAL VIDEOS MODULE
   Full-width alternating rows, click to play fullscreen
   ============================================ */
const EditorialVideos = {
    container: null,
    source: null,
    overlay: null,

    async init() {
        this.container = document.querySelector('.editorial-videos[data-source]');
        if (!this.container) return;
        this.source = this.container.dataset.source;
        this.buildOverlay();
        await this.load();
    },

    extractDriveId(url) {
        if (!url) return null;
        const m1 = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
        if (m1) return m1[1];
        const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
        if (m2) return m2[1];
        const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
        if (m3) return m3[1];
        return null;
    },

    extractYouTubeId(url) {
        if (!url) return null;
        try {
            const p = new URL(url);
            if (p.hostname === 'youtu.be') return p.pathname.slice(1);
            if (p.searchParams.has('v')) return p.searchParams.get('v');
            if (p.pathname.includes('/shorts/')) return p.pathname.split('/shorts/')[1].split(/[?&]/)[0];
        } catch (e) {
            const m = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }
        return null;
    },

    embedSrc(video) {
        const src = video.driveLink || video.videoUrl || '';
        const driveId = this.extractDriveId(src);
        if (driveId) return `https://drive.google.com/file/d/${driveId}/preview`;
        const ytId = this.extractYouTubeId(src);
        if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
        return null;
    },

    autoThumb(video) {
        if (video.thumbnail) return resolveThumbUrl(video.thumbnail);
        const src = video.driveLink || video.videoUrl || '';
        const ytId = this.extractYouTubeId(src);
        if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        const driveId = this.extractDriveId(src);
        if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
        return '';
    },

    buildOverlay() {
        const ov = document.createElement('div');
        ov.className = 'ev-overlay';
        ov.innerHTML = `
            <button class="ev-overlay__close" aria-label="Close video">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <div class="ev-overlay__frame"></div>`;
        document.body.appendChild(ov);
        this.overlay = ov;

        const close = () => this.closeVideo();
        ov.querySelector('.ev-overlay__close').addEventListener('click', close);
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    },

    openVideo(video) {
        const src = this.embedSrc(video);
        const frame = this.overlay.querySelector('.ev-overlay__frame');
        if (!src) {
            frame.innerHTML = `<div style="color:rgba(255,255,255,0.5);font-size:1rem;">Video coming soon</div>`;
        } else {
            frame.innerHTML = `<iframe src="${src}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
        }
        this.overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    },

    closeVideo() {
        if (!this.overlay) return;
        this.overlay.classList.remove('is-open');
        this.overlay.querySelector('.ev-overlay__frame').innerHTML = '';
        document.body.style.overflow = '';
    },

    async load() {
        try {
            const res = await fetch(this.source);
            if (!res.ok) throw new Error('Failed to load videos');
            const json = await res.json();
            this.render(json.videos || []);
        } catch (e) {
            console.error('EditorialVideos load error:', e);
            this.container.innerHTML = `<div class="loading"><span>Unable to load videos. Please try again later.</span></div>`;
        }
    },

    render(videos) {
        if (!videos.length) {
            this.container.innerHTML = `<div class="loading"><span>No videos yet. Check back soon.</span></div>`;
            return;
        }

        this.container.innerHTML = videos.map((v, i) => {
            const num   = String(i + 1).padStart(2, '0');
            const meta  = [v.client, v.year].filter(Boolean).join(' · ');
            const thumb = this.autoThumb(v);
            const thumbImg = thumb
                ? `<img src="${thumb}" alt="${v.title || ''}" loading="lazy" class="ev-row__img" onerror="this.style.display='none'">`
                : '';
            return `
                <article class="ev-row" data-index="${i}">
                    <div class="ev-row__media">
                        ${thumbImg}
                        <div class="ev-row__play">
                            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                        </div>
                        <span class="ev-row__num">${num}</span>
                    </div>
                    <div class="ev-row__body">
                        ${meta ? `<div class="ev-row__meta">${meta}</div>` : ''}
                        <h3 class="ev-row__title">${v.title || 'Untitled'}</h3>
                        ${v.description ? `<p class="ev-row__desc">${v.description}</p>` : ''}
                        <span class="ev-row__cta">Watch film <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;vertical-align:-2px;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
                    </div>
                </article>`;
        }).join('');

        this.container.querySelectorAll('.ev-row').forEach((row, i) => {
            row.addEventListener('click', () => this.openVideo(videos[i]));
        });
    }
};

/* ============================================
   HERO VIDEO MODULE
   Single large highlight thumbnail, click to play fullscreen
   ============================================ */
const HeroVideo = {
    container: null,
    source: null,
    overlay: null,

    async init() {
        this.container = document.querySelector('.hero-video[data-source]');
        if (!this.container) return;
        this.source = this.container.dataset.source;
        this.buildOverlay();
        await this.load();
    },

    extractDriveId(url) {
        if (!url) return null;
        const m1 = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
        if (m1) return m1[1];
        const m2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
        if (m2) return m2[1];
        const m3 = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/);
        if (m3) return m3[1];
        return null;
    },

    extractYouTubeId(url) {
        if (!url) return null;
        try {
            const p = new URL(url);
            if (p.hostname === 'youtu.be') return p.pathname.slice(1);
            if (p.searchParams.has('v')) return p.searchParams.get('v');
            if (p.pathname.includes('/shorts/')) return p.pathname.split('/shorts/')[1].split(/[?&]/)[0];
        } catch (e) {
            const m = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }
        return null;
    },

    embedSrc(video) {
        const src = video.driveLink || video.videoUrl || '';
        const driveId = this.extractDriveId(src);
        if (driveId) return `https://drive.google.com/file/d/${driveId}/preview`;
        const ytId = this.extractYouTubeId(src);
        if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
        return null;
    },

    autoThumb(video) {
        if (video.thumbnail) return resolveThumbUrl(video.thumbnail);
        const src = video.driveLink || video.videoUrl || '';
        const ytId = this.extractYouTubeId(src);
        if (ytId) return `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
        const driveId = this.extractDriveId(src);
        if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`;
        return '';
    },

    buildOverlay() {
        const ov = document.createElement('div');
        ov.className = 'ev-overlay';
        ov.innerHTML = `
            <button class="ev-overlay__close" aria-label="Close video">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <div class="ev-overlay__frame"></div>`;
        document.body.appendChild(ov);
        this.overlay = ov;
        const close = () => this.closeVideo();
        ov.querySelector('.ev-overlay__close').addEventListener('click', close);
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    },

    openVideo(video) {
        const src = this.embedSrc(video);
        const frame = this.overlay.querySelector('.ev-overlay__frame');
        frame.innerHTML = src
            ? `<iframe src="${src}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`
            : `<div style="color:rgba(255,255,255,0.5);font-size:1rem;">Video coming soon</div>`;
        this.overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    },

    closeVideo() {
        if (!this.overlay) return;
        this.overlay.classList.remove('is-open');
        this.overlay.querySelector('.ev-overlay__frame').innerHTML = '';
        document.body.style.overflow = '';
    },

    async load() {
        try {
            const res = await fetch(this.source);
            if (!res.ok) throw new Error('Failed to load highlight');
            const json = await res.json();
            const video = (json.videos || [])[0];
            if (!video) { this.container.style.display = 'none'; return; }
            this.render(video);
        } catch (e) {
            console.error('HeroVideo load error:', e);
            this.container.style.display = 'none';
        }
    },

    render(video) {
        const src = video.driveLink || video.videoUrl || '';
        const ytId = this.extractYouTubeId(src);
        const thumb = this.autoThumb(video);

        // YouTube → autoplay muted looping background preview
        if (ytId) {
            const playerId = 'heroYT_' + Math.random().toString(36).slice(2, 8);
            this.container.innerHTML = `
                <div class="hero-video__frame hero-video__frame--playing">
                    <div class="hero-video__bg">
                        <div id="${playerId}"></div>
                    </div>
                    <div class="hero-video__overlay"></div>
                    <div class="hero-video__play">
                        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                    </div>
                    ${video.title ? `<div class="hero-video__caption">${video.title}</div>` : ''}
                    <div class="hero-video__hint">Click to watch full video</div>
                </div>`;
            this.initYouTubeBg(playerId, ytId);
        } else {
            // Drive or other → static thumbnail
            const thumbImg = thumb
                ? `<img src="${thumb}" alt="${video.title || ''}" class="hero-video__img" onerror="this.style.display='none'">`
                : '';
            this.container.innerHTML = `
                <div class="hero-video__frame">
                    ${thumbImg}
                    <div class="hero-video__overlay"></div>
                    <div class="hero-video__play">
                        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                    </div>
                    ${video.title ? `<div class="hero-video__caption">${video.title}</div>` : ''}
                </div>`;
        }
        this.container.querySelector('.hero-video__frame').addEventListener('click', () => this.openVideo(video));
    },

    initYouTubeBg(playerId, ytId) {
        const create = () => {
            new YT.Player(playerId, {
                videoId: ytId,
                playerVars: {
                    autoplay: 1, mute: 1, loop: 1, playlist: ytId,
                    controls: 0, showinfo: 0, rel: 0, modestbranding: 1,
                    playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3
                },
                events: {
                    onReady: (e) => { e.target.mute(); e.target.playVideo(); },
                    onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) e.target.playVideo(); }
                }
            });
        };

        if (window.YT && window.YT.Player) {
            create();
        } else {
            // Load the API once, then create
            if (!document.getElementById('yt-iframe-api')) {
                const tag = document.createElement('script');
                tag.id = 'yt-iframe-api';
                tag.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(tag);
            }
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); create(); };
        }
    }
};

/* ============================================
   CONTACT FORM MODULE
   ============================================ */
const ContactForm = {
    form: null,
    
    init() {
        this.form = document.getElementById('contactForm');
        if (!this.form) return;
        
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    },
    
    handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData);
        
        // Validate
        if (!data.name || !data.email || !data.message) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (!this.validateEmail(data.email)) {
            alert('Please enter a valid email address.');
            return;
        }
        
        // Show success (in a real implementation, this would send to a server)
        const submitBtn = this.form.querySelector('.btn-submit');
        const originalText = submitBtn.textContent;
        
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        // Simulate sending
        setTimeout(() => {
            submitBtn.textContent = 'Message Sent!';
            this.form.reset();
            
            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }, 3000);
        }, 1500);
    },
    
    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
};

/* ============================================
   PARALLAX EFFECT (Optional - for hero sections)
   ============================================ */
const Parallax = {
    elements: [],
    
    init() {
        this.elements = document.querySelectorAll('[data-parallax]');
        if (this.elements.length === 0) return;
        
        window.addEventListener('scroll', () => this.update());
    },
    
    update() {
        const scrollY = window.scrollY;
        
        this.elements.forEach(el => {
            const speed = parseFloat(el.dataset.parallax) || 0.5;
            const offset = scrollY * speed;
            el.style.transform = `translateY(${offset}px)`;
        });
    }
};

/* ============================================
   SMOOTH SCROLL TO ANCHORS
   ============================================ */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

/* ============================================
   PRELOAD CRITICAL ASSETS
   ============================================ */
window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});