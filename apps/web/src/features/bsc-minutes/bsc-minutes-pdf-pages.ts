type PrintUnit = { nodes: Element[]; table?: HTMLTableElement; rows?: HTMLTableRowElement[] };

const printUnits = (source: HTMLElement): PrintUnit[] => {
  const units: PrintUnit[] = [];
  let headings: Element[] = [];
  const visit = (node: Element) => {
    if (node.matches('section') && node.querySelector('table')) {
      [...node.children].forEach(visit);
    } else if (node.matches('h2, h3')) {
      headings.push(node);
    } else if (node.matches('table')) {
      const table = node as HTMLTableElement;
      let group: HTMLTableRowElement[] = [];
      for (const row of [...table.tBodies].flatMap((body) => [...body.rows])) {
        group.push(row);
        if (!row.classList.contains('minutes-print-group')) {
          units.push({ nodes: headings, table, rows: group });
          headings = [];
          group = [];
        }
      }
      if (group.length) units.push({ nodes: headings, table, rows: group });
      headings = [];
    } else {
      units.push({ nodes: [...headings, node] });
      headings = [];
    }
  };
  [...source.children].forEach(visit);
  if (headings.length) units.push({ nodes: headings });
  return units;
};

// Paginate actual table rows before rasterizing; no image slice can cross a glyph.
export const createMinutesPdfPages = (source: HTMLElement, target: Document) => {
  const pages: HTMLElement[] = [];
  const maxHeight = 257 * 96 / 25.4 - 4;
  let tableSource: HTMLTableElement | undefined;
  let table: HTMLTableElement | undefined;
  const newPage = () => {
    const page = target.importNode(source, false);
    page.style.cssText = '';
    page.classList.add('minutes-pdf-page');
    target.body.append(page);
    pages.push(page);
    table = undefined;
    tableSource = undefined;
    return page;
  };
  let page = newPage();
  const append = (unit: PrintUnit) => {
    const added: Node[] = [];
    for (const node of unit.nodes) {
      const clone = target.importNode(node, true);
      page.append(clone);
      added.push(clone);
    }
    if (unit.table) {
      if (tableSource !== unit.table || !table) {
        table = target.importNode(unit.table, false);
        for (const child of unit.table.children) {
          if (child.matches('colgroup, thead')) table.append(target.importNode(child, true));
        }
        table.append(target.createElement('tbody'));
        page.append(table);
        added.push(table);
        tableSource = unit.table;
      }
      for (const row of unit.rows ?? []) {
        const clone = target.importNode(row, true);
        table.tBodies[0].append(clone);
        added.push(clone);
      }
    } else {
      table = undefined;
      tableSource = undefined;
    }
    return added;
  };

  for (const unit of printUnits(source)) {
    const hadContent = page.childElementCount > 0;
    const added = append(unit);
    if (hadContent && page.getBoundingClientRect().height > maxHeight) {
      added.reverse().forEach((node) => node.parentNode?.removeChild(node));
      page = newPage();
      append(unit);
    }
  }
  return pages;
};
