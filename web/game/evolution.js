let scene = null;

export function closeEvolution() {
  scene?.finish();
}

export function playEvolution(before, after) {
  closeEvolution();
  const dialog = document.createElement('dialog');
  dialog.className = 'evolution-dialog';
  dialog.setAttribute('aria-labelledby', 'evolution-title');
  dialog.dataset.phase = 'gathering';
  const particles = Array.from({length: 36}, (_, i) => {
    const angle = (i * Math.PI * 2) / 36,
      radius = 95 + (i % 5) * 22;
    return `<i class="evo-particle" style="--dx:${Math.cos(angle) * radius}px;--dy:${Math.sin(angle) * radius}px;--delay:${(i % 12) * 0.055}s"></i>`;
  }).join('');
  dialog.innerHTML = `<div class="evo-heading"><span>成长的瞬间</span><h2 id="evolution-title"></h2></div>
    <div class="evo-stage"><span class="evo-orbit"></span><span class="evo-orbit second"></span>${particles}
      <img class="evo-before" alt=""><img class="evo-after" alt=""><span class="evo-flare"></span></div>
    <div class="evo-caption"><p id="evolution-description" role="status"></p><p id="evolution-nickname"></p>
      <button type="button" class="secondary">跳过动画</button></div>`;
  const title = dialog.querySelector('h2'),
    description = dialog.querySelector('#evolution-description');
  const oldImage = dialog.querySelector('.evo-before'),
    newImage = dialog.querySelector('.evo-after');
  title.textContent = `${before.nickname || before.name}正在进化`;
  description.textContent = '光芒正在汇聚，新的模样即将出现……';
  for (const [node, partner] of [
    [oldImage, before],
    [newImage, after]
  ]) {
    node.hidden = !partner.image;
    if (partner.image) node.src = `/${partner.image}`;
    node.alt = partner.name;
  }
  document.body.append(dialog);
  return new Promise((resolve) => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      dialog.close();
      dialog.remove();
      if (scene?.dialog === dialog) scene = null;
      resolve();
    };
    scene = {dialog, finish};
    const reveal = () => {
      clearTimeout(timer);
      dialog.dataset.phase = 'revealed';
      title.textContent = '进化完成！';
      description.textContent = `恭喜！${before.name}进化成了${after.name}。`;
      dialog.querySelector('#evolution-nickname').textContent = after.nickname ? `昵称「${after.nickname}」会继续陪伴它。` : '';
      dialog.querySelector('button').textContent = '继续冒险';
    };
    dialog.querySelector('button').onclick = () => (dialog.dataset.phase === 'revealed' ? finish() : reveal());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (dialog.dataset.phase === 'revealed') finish();
      else reveal();
    });
    dialog.showModal();
    timer = setTimeout(reveal, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2800);
  });
}
