/* ==========================================================================
   STOCKCONTROL — script.js
   Consome a API criada em Google Apps Script (ver Code.gs) que lê/escreve
   diretamente numa Google Sheet.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1) CONFIGURAÇÃO
   -------------------------------------------------------------------------
   Substitua a URL abaixo pela URL do seu Web App depois de publicar o
   Google Apps Script (Implementar > Nova implementação > Aplicativo da Web).
   Deve terminar em "/exec".
   -------------------------------------------------------------------------- */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyfPhkp4QsWuFXMCHsL68LHqm7njsDcGA2zRFLOyp1Vi--cVnVuTl5UO9OwUMdHIAMH1w/exec'
};

/* Estado local da aplicação (cache dos dados vindos da Sheet) */
let STATE = {
  products: []
};

/* --------------------------------------------------------------------------
   2) HELPERS DE COMUNICAÇÃO COM A API
   -------------------------------------------------------------------------- */

/**
 * Faz um GET à API do Apps Script para carregar todos os produtos.
 */
async function apiGetProducts() {
  const res = await fetch(`${CONFIG.API_URL}?action=list`, { method: 'GET' });
  if (!res.ok) throw new Error('Falha ao contactar a API (GET).');
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erro desconhecido na API.');
  return json.data;
}

/**
 * Envia um POST à API do Apps Script.
 * O Apps Script espera um corpo JSON com { action, payload }.
 * action pode ser: "create" | "update" | "delete" | "movement"
 */
async function apiPost(action, payload) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    // O Apps Script Web App exige este content-type para evitar preflight CORS.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  if (!res.ok) throw new Error('Falha ao contactar a API (POST).');
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erro desconhecido na API.');
  return json.data;
}

/* --------------------------------------------------------------------------
   3) LÓGICA DE STATUS DE ESTOQUE
   -------------------------------------------------------------------------- */

/**
 * Calcula o status visual com base na quantidade atual vs. mínima.
 * - Comprar Já!   -> quantidade <= 0  OU  quantidade < 50% do mínimo
 * - Nível Crítico -> quantidade <= quantidade mínima (mas acima de 50%)
 * - Estoque Normal -> quantidade > quantidade mínima
 */
function computeStatus(qtdAtual, qtdMinima) {
  const atual = Number(qtdAtual) || 0;
  const minima = Number(qtdMinima) || 0;

  if (atual <= 0 || atual < minima * 0.5) return 'Comprar Já!';
  if (atual <= minima) return 'Nível Crítico';
  return 'Estoque Normal';
}

function statusBadgeClass(status) {
  if (status === 'Comprar Já!') return 'badge-comprar';
  if (status === 'Nível Crítico') return 'badge-critico';
  return 'badge-normal';
}

/* --------------------------------------------------------------------------
   4) RENDERIZAÇÃO
   -------------------------------------------------------------------------- */

function renderAll() {
  renderStatCards();
  renderShoppingList();
  renderTable();
  renderMovementSelect();
}

function renderStatCards() {
  const total = STATE.products.length;
  const normal = STATE.products.filter(p => p.status === 'Estoque Normal').length;
  const critico = STATE.products.filter(p => p.status === 'Nível Crítico').length;
  const comprar = STATE.products.filter(p => p.status === 'Comprar Já!').length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statNormal').textContent = normal;
  document.getElementById('statCritico').textContent = critico;
  document.getElementById('statComprar').textContent = comprar;
}

function renderShoppingList() {
  const container = document.getElementById('shoppingList');
  const alertItems = STATE.products
    .filter(p => p.status === 'Comprar Já!' || p.status === 'Nível Crítico')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'Comprar Já!' ? -1 : 1));

  if (alertItems.length === 0) {
    container.innerHTML = `<p class="empty-state">Sem alertas de compra no momento 🎉</p>`;
    return;
  }

  container.innerHTML = alertItems.map(p => `
    <div class="shopping-item">
      <div>
        <span class="si-name">${escapeHtml(p.nome)}</span>
        <span class="si-meta">${escapeHtml(p.local)} · faltam ${Math.max(0, p.qtdMinima - p.qtdAtual)} ${escapeHtml(p.unidade || 'un')}</span>
      </div>
      <span class="badge ${statusBadgeClass(p.status)}">${p.status}</span>
    </div>
  `).join('');
}

function renderTable() {
  const tbody = document.getElementById('productsTableBody');
  const emptyState = document.getElementById('tableEmptyState');

  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const fLocal = document.getElementById('filterLocal').value;
  const fCategoria = document.getElementById('filterCategoria').value;
  const fStatus = document.getElementById('filterStatus').value;

  const filtered = STATE.products.filter(p => {
    if (search && !p.nome.toLowerCase().includes(search)) return false;
    if (fLocal && p.local !== fLocal) return false;
    if (fCategoria && p.categoria !== fCategoria) return false;
    if (fStatus && p.status !== fStatus) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>
        <span class="prod-name">${escapeHtml(p.nome)}</span>
        <span class="prod-sub">ID ${escapeHtml(p.id)}</span>
      </td>
      <td>${escapeHtml(p.categoria)}</td>
      <td>${escapeHtml(p.local)}</td>
      <td>${p.qtdAtual} ${escapeHtml(p.unidade || 'un')}</td>
      <td>${p.qtdMinima} ${escapeHtml(p.unidade || 'un')}</td>
      <td><span class="badge ${statusBadgeClass(p.status)}">${p.status}</span></td>
      <td class="td-actions">
        <div class="row-actions">
          <button class="table-action-btn" title="Editar" data-edit="${escapeHtml(p.id)}">✎</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(btn.dataset.edit));
  });
}

function renderMovementSelect() {
  const select = document.getElementById('movProduto');
  const current = select.value;
  select.innerHTML = `<option value="">Selecione um produto…</option>` +
    STATE.products.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)} (${escapeHtml(p.local)})</option>`).join('');
  if (current) select.value = current;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* --------------------------------------------------------------------------
   5) CARREGAMENTO DE DADOS
   -------------------------------------------------------------------------- */

async function loadProducts() {
  try {
    setSyncBadge('A sincronizar…');
    const data = await apiGetProducts();

    // Garante que o status vem sempre calculado, mesmo que o backend
    // devolva os valores em bruto (defesa extra além do cálculo no Apps Script).
    STATE.products = data.map(p => ({
      ...p,
      status: p.status || computeStatus(p.qtdAtual, p.qtdMinima)
    }));

    renderAll();
    setSyncBadge('Sincronizado às ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
  } catch (err) {
    console.error(err);
    setSyncBadge('Falha na ligação');
    showToast('Não foi possível ligar à Google Sheet. Verifique a API_URL em script.js.', 'error');
  }
}

function setSyncBadge(text) {
  document.getElementById('lastSync').textContent = text;
}

/* --------------------------------------------------------------------------
   6) NAVEGAÇÃO ENTRE VIEWS
   -------------------------------------------------------------------------- */

function initNavigation() {
  document.querySelectorAll('.side-link').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    });
  });
}

/* --------------------------------------------------------------------------
   7) MODAL DE PRODUTO (Criar / Editar / Eliminar)
   -------------------------------------------------------------------------- */

function initProductModal() {
  document.querySelectorAll('[data-open-modal="produto"]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(null));
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeProductModal);
  });
  document.getElementById('modalProduto').addEventListener('click', (e) => {
    if (e.target.id === 'modalProduto') closeProductModal();
  });

  document.getElementById('productForm').addEventListener('submit', onSubmitProduct);
  document.getElementById('btnDeleteProduct').addEventListener('click', onDeleteProduct);
}

function openProductModal(id) {
  const modal = document.getElementById('modalProduto');
  const form = document.getElementById('productForm');
  form.reset();

  if (id) {
    const p = STATE.products.find(x => String(x.id) === String(id));
    if (!p) return;
    document.getElementById('modalProdutoTitle').textContent = 'Editar Produto';
    document.getElementById('prodId').value = p.id;
    document.getElementById('prodNome').value = p.nome;
    document.getElementById('prodCategoria').value = p.categoria;
    document.getElementById('prodLocal').value = p.local;
    document.getElementById('prodQtdAtual').value = p.qtdAtual;
    document.getElementById('prodQtdMinima').value = p.qtdMinima;
    document.getElementById('prodUnidade').value = p.unidade || 'un';
    document.getElementById('btnDeleteProduct').style.display = 'inline-block';
  } else {
    document.getElementById('modalProdutoTitle').textContent = 'Novo Produto';
    document.getElementById('prodId').value = '';
    document.getElementById('btnDeleteProduct').style.display = 'none';
  }

  modal.classList.add('open');
}

function closeProductModal() {
  document.getElementById('modalProduto').classList.remove('open');
}

async function onSubmitProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prodId').value;

  const payload = {
    id: id || undefined,
    nome: document.getElementById('prodNome').value.trim(),
    categoria: document.getElementById('prodCategoria').value,
    local: document.getElementById('prodLocal').value,
    qtdAtual: Number(document.getElementById('prodQtdAtual').value),
    qtdMinima: Number(document.getElementById('prodQtdMinima').value),
    unidade: document.getElementById('prodUnidade').value.trim() || 'un'
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    if (id) {
      await apiPost('update', payload);
      showToast('Produto atualizado com sucesso.', 'success');
    } else {
      await apiPost('create', payload);
      showToast('Produto criado com sucesso.', 'success');
    }
    closeProductModal();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao guardar o produto.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function onDeleteProduct() {
  const id = document.getElementById('prodId').value;
  if (!id) return;
  if (!confirm('Tem a certeza que quer eliminar este produto?')) return;

  try {
    await apiPost('delete', { id });
    showToast('Produto eliminado.', 'success');
    closeProductModal();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao eliminar o produto.', 'error');
  }
}

/* --------------------------------------------------------------------------
   8) MOVIMENTOS (Entrada / Saída)
   -------------------------------------------------------------------------- */

let currentMovType = 'entrada';

function initMovementForm() {
  document.querySelectorAll('[data-mov-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mov-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMovType = btn.dataset.movType;
    });
  });

  document.getElementById('movementForm').addEventListener('submit', onSubmitMovement);
}

async function onSubmitMovement(e) {
  e.preventDefault();
  const produtoId = document.getElementById('movProduto').value;
  const quantidade = Number(document.getElementById('movQtd').value);
  const nota = document.getElementById('movNota').value.trim();

  if (!produtoId) {
    showToast('Selecione um produto.', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    await apiPost('movement', {
      id: produtoId,
      tipo: currentMovType, // "entrada" ou "saida"
      quantidade,
      nota
    });
    showToast(currentMovType === 'entrada' ? 'Entrada registada com sucesso.' : 'Saída registada com sucesso.', 'success');
    e.target.reset();
    document.getElementById('movQtd').value = 1;
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao registar movimento.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   9) FILTROS E PESQUISA
   -------------------------------------------------------------------------- */

function initFilters() {
  ['searchInput', 'filterLocal', 'filterCategoria', 'filterStatus'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderTable);
    document.getElementById(id).addEventListener('change', renderTable);
  });
}

/* --------------------------------------------------------------------------
   10) TOAST
   -------------------------------------------------------------------------- */

let toastTimer = null;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/* --------------------------------------------------------------------------
   11) INICIALIZAÇÃO
   -------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initProductModal();
  initMovementForm();
  initFilters();

  document.getElementById('btnRefresh').addEventListener('click', loadProducts);

  loadProducts();
});
