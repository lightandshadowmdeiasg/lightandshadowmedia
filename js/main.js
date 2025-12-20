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
        // Set video (YouTube embed)
        if (data.videoUrl) {
            const videoId = this.extractYouTubeId(data.videoUrl);
            if (videoId) {
                this.videoContainer.innerHTML = `
                    <iframe 
                        src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                `;
            }
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
    
    extractYouTubeId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
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
   PROJECT LOADER MODULE
   ============================================ */
const ProjectLoader = {
    grid: null,
    source: null,
    filterTabs: null,
    currentFilter: 'all',
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
            this.data = json.events || json.projects || json.films || [];
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
        this.grid.querySelectorAll('.project-card').forEach((card, index) => {
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
            this.grid.querySelectorAll('.project-card').forEach((card, index) => {
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
        const isLiveEvents = this.source && this.source.indexOf('live-events') !== -1;
        const isBookable   = isLiveEvents && item.status === 'upcoming';

        const bookingButton = isBookable ? `
                <div class="project-actions" style="margin-top: 1rem;">
                    <button class="btn btn-primary js-open-booking" type="button">
                        Book Seat
                    </button>
                </div>
        ` : '';

    
        return `
            <article class="project-card stagger-item" data-index="${index}">
                ${item.thumbnail ?
                    `<img src="${item.thumbnail}" alt="${item.title}" class="project-card-image" loading="lazy">` :
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
                    ${bookingButton}
                </div>
                ${item.videoUrl ? `
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

