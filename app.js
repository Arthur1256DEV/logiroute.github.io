// Configurações iniciais do Mapa centrado em Maceió
const map = L.map('map').setView([-9.66599, -35.73528], 13); 
const smartOptimizeBtn = document.getElementById('smart-optimize-btn');

// Adicionando o estilo "Dark Mode" do mapa via CartoDB
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO'
}).addTo(map);

// Chave do OpenRouteService
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjljNzA4YTI0MGYxYTQ0M2RiOTQ0YThmMzcyZDVmZjAyIiwiaCI6Im11cm11cjY0In0='; 

let stops = [];
let routeLayer = null; // Guarda a linha da rota desenhada
let markers = []; // Guarda os pinos numerados no mapa

const addressInput = document.getElementById('address-input');
const addBtn = document.getElementById('add-btn');
const addressList = document.getElementById('address-list');
const optimizeBtn = document.getElementById('optimize-btn');
const exportBtn = document.getElementById('export-btn');
const stopCountEl = document.getElementById('stop-count');

// Função para buscar as coordenadas de um endereço (Geocodificação via Nominatim)
async function geocodeAddress(address) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            // Retorna Longitude primeiro, depois Latitude (Padrão do OpenRouteService)
            return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
        } else {
            throw new Error('Endereço não encontrado');
        }
    } catch (error) {
        console.error("Erro na geocodificação:", error);
        return null;
    }
}

// Desenha e atualiza os marcadores com a numeração correta
function renderMarkers() {
    // Limpa os marcadores anteriores para evitar duplicações
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];

    // Desenha cada ponto com o índice atualizado
    stops.forEach((stop, index) => {
        const numberIcon = L.divIcon({
            className: 'custom-icon-wrapper',
            html: `<div class="custom-number-marker"><span>${index + 1}</span></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });

        const marker = L.marker([stop.coords[1], stop.coords[0]], { icon: numberIcon })
            .addTo(map)
            .bindPopup(`<b>Parada ${index + 1}:</b><br>${stop.address}`);
            
        markers.push({ id: stop.id, marker: marker });
    });
}

// Adiciona endereço na lista, busca a coordenada e atualiza o mapa
async function addAddress() {
    const text = addressInput.value.trim();
    if (text === "") return;

    addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    const coords = await geocodeAddress(text);
    
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';

    if (!coords) {
        alert("Não conseguimos encontrar esse endereço. Tente incluir o número ou o nome da cidade.");
        return;
    }

    stops.push({ id: Date.now(), address: text, coords: coords });
    
    renderMarkers();
    renderList();
    
    map.flyTo([coords[1], coords[0]], 15);

    addressInput.value = "";
    addressInput.focus();
}

// Renderiza a lista textual na barra lateral
function renderList() {
    addressList.innerHTML = "";
    stops.forEach((stop, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${index + 1}. ${stop.address}</span>
            <i class="fa-solid fa-trash-can remove-stop" onclick="removeStop(${stop.id})"></i>
        `;
        addressList.appendChild(li);
    });
    stopCountEl.innerText = stops.length;
}

// Remove uma parada da lista e atualiza os componentes visuais
window.removeStop = (id) => {
    stops = stops.filter(s => s.id !== id);
    
    renderMarkers();
    renderList();
    
    // Oculta o botão se a quantidade de paradas se tornar insuficiente
    if (stops.length < 2) {
        exportBtn.style.display = 'none';
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
    }
};

// Ouvintes de eventos para inserção de dados
addBtn.addEventListener('click', addAddress);
addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAddress();
});

// Integração com a API de Rotas (OpenRouteService)
optimizeBtn.addEventListener('click', async () => {
    if (stops.length < 2) {
        alert("Adicione pelo menos 2 endereços para calcular a rota!");
        return;
    }

    optimizeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traçando Rota...';
    const coordinatesArray = stops.map(stop => stop.coords);

    try {
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json',
                'Content-Type': 'application/json',
                'Authorization': ORS_API_KEY
            },
            body: JSON.stringify({
                coordinates: coordinatesArray
            })
        });

        const geojsonResponse = await response.json();

        if (geojsonResponse.error) {
            throw new Error(geojsonResponse.error.message);
        }

        if (routeLayer) {
            map.removeLayer(routeLayer);
        }

        // Desenha a linha da rota no mapa
        routeLayer = L.geoJSON(geojsonResponse, {
            style: function () {
                return { color: '#38bdf8', weight: 5, opacity: 0.8 };
            }
        }).addTo(map);

        // Enquadra a rota inteira na tela
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // AQUI ESTÁ A CORREÇÃO: Torna o botão visível após o sucesso da rota
        exportBtn.style.display = 'flex';

    } catch (error) {
        console.error("Erro ao calcular rota:", error);
        alert("Houve um erro ao calcular a rota. Verifique a conexão ou os endereços inseridos.");
    } finally {
        optimizeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Otimizar Rota';
    }
});

// Exportar os pontos na sequência exata para o Google Maps
exportBtn.addEventListener('click', () => {
    if (stops.length < 2) return;

    // Mapeia no formato lat,lon exigido pelo padrão de rotas do Google Maps
    const waypoints = stops.map(stop => `${stop.coords[1]},${stop.coords[0]}`).join('/');
    const googleMapsUrl = `https://www.google.com/maps/dir/${waypoints}`;
    
    window.open(googleMapsUrl, '_blank');
});

// Botão de Limpar Tudo
document.getElementById('clear-btn').addEventListener('click', () => {
    stops = [];
    renderMarkers();
    
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    renderList();
    exportBtn.style.display = 'none';
    map.setView([-9.66599, -35.73528], 13);
});

// Torna a lista de endereços arrastável (Drag and Drop)
new Sortable(addressList, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
        // Quando o usuário soltar o item, reordenamos o nosso array `stops`
        const itemMoved = stops.splice(evt.oldIndex, 1)[0];
        stops.splice(evt.newIndex, 0, itemMoved);
        
        // Atualiza os números na tela e no mapa
        renderList();
        renderMarkers();
    }
});

// A Matemática Pesada: API de Otimização (Problema do Caixeiro Viajante)
smartOptimizeBtn.addEventListener('click', async () => {
    if (stops.length < 3) {
        alert("A otimização inteligente requer pelo menos 3 pontos (1 origem e 2 entregas).");
        return;
    }

    smartOptimizeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculando Melhor Rota...';

    // Formato exigido pelo algoritmo VROOM do OpenRouteService
    const optimizationPayload = {
        vehicles: [{
            id: 1,
            profile: "driving-car",
            start: stops[0].coords // Consideramos que o ponto 1 é a base/origem
        }],
        jobs: stops.slice(1).map(stop => ({
            id: stop.id,
            location: stop.coords
        }))
    };

    try {
        const response = await fetch('https://api.openrouteservice.org/optimization', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': ORS_API_KEY
            },
            body: JSON.stringify(optimizationPayload)
        });

        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // A API devolve a sequência ideal de paradas (steps)
        const optimizedSteps = data.routes[0].steps;
        
        // Reconstruímos a nossa lista `stops` na ordem exata que a inteligência decidiu
        let newStopsOrder = [stops[0]]; // A origem se mantém
        
        // Pulamos o primeiro (start) e o último (end) passo da resposta da API
        for (let i = 1; i < optimizedSteps.length - 1; i++) {
            const jobId = optimizedSteps[i].job;
            const originalStop = stops.find(s => s.id === jobId);
            if (originalStop) newStopsOrder.push(originalStop);
        }

        stops = newStopsOrder; // Substitui o array antigo pelo otimizado
        
        renderList();
        renderMarkers();

        // Agora que está reordenado, acionamos o botão de Traçar Rota automaticamente
        document.getElementById('optimize-btn').click();

    } catch (error) {
        console.error("Erro na otimização:", error);
        alert("Houve um erro ao otimizar a rota automaticamente.");
    } finally {
        smartOptimizeBtn.innerHTML = '<i class="fa-solid fa-brain"></i> Ordenação Inteligente';
    }
}); 

// ==========================================
// MÓDULO DE LEITURA DE QR CODE
// ==========================================
const qrBtn = document.getElementById('qr-btn');
const closeQrBtn = document.getElementById('close-qr-btn');
const qrContainer = document.getElementById('qr-reader-container');
let html5QrcodeScanner = null;

// Ativa a câmera quando o botão de QR Code é clicado
qrBtn.addEventListener('click', () => {
    qrContainer.style.display = 'block';
    
    // Configuração do scanner (10 frames por segundo)
    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
    );
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
});

// Cancela e desliga a câmera
closeQrBtn.addEventListener('click', () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }
    qrContainer.style.display = 'none';
});

// O que acontece quando a câmera consegue ler um código
function onScanSuccess(decodedText, decodedResult) {
    // 1. Desliga o scanner visualmente
    html5QrcodeScanner.clear();
    qrContainer.style.display = 'none';
    
    let finalAddress = decodedText; // Começamos assumindo que é texto puro

    // 2. Programação Defensiva: Tenta converter a string para JSON
    try {
        const qrData = JSON.parse(decodedText);
        
        // Se for JSON, procura por propriedades conhecidas que guardam o endereço
        if (qrData.endereco_completo) {
            finalAddress = qrData.endereco_completo;
        } else if (qrData.rua && qrData.cidade) {
            finalAddress = `${qrData.rua}, ${qrData.cidade} - ${qrData.estado || ''}`;
        }
        console.log("Formato JSON detectado e extraído com sucesso!");

    } catch (e) {
        // Caiu no catch? Significa que não é JSON válido.
        // O código não "quebra", ele apenas aceita que é um texto normal ou código.
        console.log("Leitura identificada como Texto Denso ou ID.");
    }

    // 3. Joga o endereço descoberto no input
    addressInput.value = finalAddress;
    
    // 4. Dispara a função de adicionar automaticamente
    addAddress();
}

// A biblioteca emite um erro a cada frame que não acha um QR code. 
// Apenas ignoramos isso para não poluir o console.
function onScanFailure(error) {
    // console.warn(`Code scan error = ${error}`);
}