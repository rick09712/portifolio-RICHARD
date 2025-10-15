import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

let camera, scene, renderer;
let robotHead, headBone;
let mixer;
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();
const availableExpressions = ['ThumbsUp', 'Jump'];
let expressionIndex = 0;
let currentAction;
let originalMaterials = new Map();
let wireframeMaterial;
let isWireframeMode = false;
let resizeTimer; 

init();

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, -0.2, 3.5); 
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
    });
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });

    const loader = new GLTFLoader();
    loader.load(
        'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
        (gltf) => {
            robotHead = gltf.scene;
            robotHead.traverse((child) => {
                if (child.isMesh) { originalMaterials.set(child.uuid, child.material); }
                if (child.isSkinnedMesh) { headBone = child.skeleton.getBoneByName('Head'); }
            });
            const scale = window.innerWidth < 768 ? 0.25 : 0.349;
            robotHead.scale.setScalar(scale);
            robotHead.position.y = -0.9;
            scene.add(robotHead);
            mixer = new THREE.AnimationMixer(robotHead);
            const waveClip = THREE.AnimationClip.findByName(gltf.animations, 'Wave');
            if (waveClip) {
                const waveAction = mixer.clipAction(waveClip);
                waveAction.setLoop(THREE.LoopOnce);
                waveAction.timeScale = 0.6;
                waveAction.clampWhenFinished = true;
                waveAction.play();
                currentAction = waveAction;
            }
            setupAllInteractions(gltf.animations);
        },
        undefined, (error) => console.error('Um erro ocorreu ao carregar o robô', error)
    );

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove);
    renderer.setAnimationLoop(animate);
    
    wakeUpServices();
}

function wakeUpServices() {
    const serviceUrls = [
        'https://chatbot-backend-m7lg.onrender.com',
        'https://cop-ecommerce-api.onrender.com'
    ];

    console.log('Enviando pings para acordar os servidores...');
    serviceUrls.forEach(url => {
        fetch(url, { mode: 'no-cors' })
            .then(() => console.log(`Ping enviado para ${url}`))
            .catch(() => console.log(`Ping para ${url} enviado (erro esperado se estiver dormindo).`));
    });
}

function setupAllInteractions(animations) {
    const menuIcon = document.querySelector('.menu-icon');
    const menuOverlay = document.querySelector('#menu-overlay');
    const navLinks = document.querySelectorAll('.menu-overlay nav a');
    const topLink = document.querySelector('.top-link');
    const bottomLink = document.querySelector('.bottom-link');
    const projectItems = document.querySelectorAll('.project-item');
    const modal = document.querySelector('#project-modal');
    const closeButton = document.querySelector('.modal-close-button');

    menuIcon.addEventListener('click', () => {
        menuOverlay.classList.toggle('active');
        menuIcon.classList.toggle('active');
        triggerNextExpression(animations);
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const pageId = link.getAttribute('href').substring(1);
            navigateTo(pageId);
            menuOverlay.classList.remove('active');
            menuIcon.classList.remove('active');
        });
    });

    topLink.addEventListener('click', (event) => {
        event.preventDefault();
        navigateTo('work');
    });

    const holdTriggers = [bottomLink, renderer.domElement];
    holdTriggers.forEach(element => {
        element.addEventListener('mousedown', () => setWireframeMode(true));
        element.addEventListener('mouseup', () => setWireframeMode(false));
        element.addEventListener('mouseleave', () => setWireframeMode(false));
        element.addEventListener('touchstart', (e) => { e.preventDefault(); setWireframeMode(true); }, { passive: false });
        element.addEventListener('touchend', () => setWireframeMode(false));
    });

    projectItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.classList.contains('in-production')) {
                return;
            }
            const projectData = {
                title: item.dataset.title,
                description: item.dataset.description,
                tech: item.dataset.tech,
                link: item.dataset.link,
                linkBackend: item.dataset.linkBackend
            };
            openModal(projectData);
        });
    });

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}

function openModal(data) {
    const modal = document.querySelector('#project-modal');
    document.querySelector('#modal-title').textContent = data.title;
    document.querySelector('#modal-description').textContent = data.description;
    document.querySelector('#modal-tech').textContent = data.tech;
    
    const linkFullstack = document.querySelector('#modal-link-fullstack');
    const linkBackend = document.querySelector('#modal-link-backend');

    if (data.link && data.link !== '#') {
        linkFullstack.href = data.link;
        linkFullstack.style.display = 'inline-block';
    } else {
        linkFullstack.style.display = 'none';
    }

    if (data.linkBackend && data.linkBackend !== '#') {
        linkBackend.href = data.linkBackend;
        linkBackend.style.display = 'inline-block';
    } else {
        linkBackend.style.display = 'none';
    }
    
    modal.classList.add('active');
}

function closeModal() {
    const modal = document.querySelector('#project-modal');
    modal.classList.remove('active');
}

function navigateTo(pageId) {
    const currentPage = document.querySelector('.page.active');
    const nextPage = document.querySelector(`#${pageId}`);
    if (currentPage && nextPage && currentPage !== nextPage) {
        currentPage.classList.remove('active');
        if (currentPage.id === 'home') animateRobot(false);
        setTimeout(() => {
            nextPage.classList.add('active');
            if (nextPage.id === 'home') animateRobot(true);
        }, 500);
    }
}

function animateRobot(isIn) {
    if (!robotHead) return;
    const mobileScale = window.innerWidth < 768 ? 0.25 : 0.349;
    const targetScale = isIn ? mobileScale : 0;
    const targetY = isIn ? -0.9 : -3;
    const duration = 500;
    const initialScale = robotHead.scale.x;
    const initialY = robotHead.position.y;
    let start = null;
    function step(timestamp) {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        robotHead.scale.setScalar(initialScale + (targetScale - initialScale) * progress);
        robotHead.position.y = initialY + (targetY - initialY) * progress;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function setWireframeMode(active) {
    if (isWireframeMode === active) return;
    robotHead.traverse((child) => {
        if (child.isMesh) {
            if (active) {
                child.material = wireframeMaterial;
            } else {
                child.material = originalMaterials.get(child.uuid);
            }
        }
    });
    isWireframeMode = active;
}

function triggerNextExpression(animations) {
    if (!mixer) return;
    const nextExpressionName = availableExpressions[expressionIndex];
    const clip = THREE.AnimationClip.findByName(animations, nextExpressionName);
    expressionIndex = (expressionIndex + 1) % availableExpressions.length;
    if (clip) {
        const newAction = mixer.clipAction(clip);
        newAction.setLoop(THREE.LoopOnce);
        newAction.clampWhenFinished = true;
        if (currentAction && currentAction !== newAction) {
            currentAction.fadeOut(0.2);
            newAction.reset().fadeIn(0.2).play();
        } else {
            newAction.reset().play();
        }
        currentAction = newAction;
    }
}

function onWindowResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    }, 150);
}

function onPointerMove(event) {
    let x, y;
    if (event.changedTouches) {
        x = event.changedTouches[0].clientX;
        y = event.changedTouches[0].clientY;
    } else {
        x = event.clientX;
        y = event.clientY;
    }
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
}

function animate() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (headBone && robotHead.scale.x > 0) {
        const targetRotationY = mouse.x * 0.4;
        const targetRotationX = -mouse.y * 0.4;
        headBone.rotation.y += (targetRotationY - headBone.rotation.y) * 0.1;
        headBone.rotation.x += (targetRotationX - headBone.rotation.x) * 0.1;
    }
    renderer.render(scene, camera);
}

const mainTitle = document.querySelector('#home .main-title');
setTimeout(() => { if (mainTitle) mainTitle.classList.add('fade-out'); }, 2500);
