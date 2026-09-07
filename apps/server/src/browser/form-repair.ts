import type * as cheerio from 'cheerio';

/**
 * Repairs malformed HTML where container closing tags (e.g. </div>, </center>, </p>, </section>)
 * appear inside a <form> before that container was ever opened inside the <form>.
 * This commonly happens on link-lockers and CMS sites where outer wrappers are closed
 * after <form> starts, causing HTML parsers like Cheerio/htmlparser2 to auto-close <form> prematurely
 * and detach submit buttons/inputs.
 */
export function repairMalformedForms(rawHtml: string): string {
  if (!rawHtml || !rawHtml.includes('<form')) return rawHtml;

  const formRegex = /<form\b[^>]*>/gi;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = formRegex.exec(rawHtml)) !== null) {
    const formStart = match.index;
    result += rawHtml.substring(lastIndex, formStart);

    const rest = rawHtml.substring(formStart);
    const formTag = match[0];
    const afterFormTag = rest.substring(formTag.length);
    const endFormIndex = afterFormTag.search(/<\/form\s*>/i);

    if (endFormIndex === -1) {
      result += formTag;
      lastIndex = formStart + formTag.length;
      continue;
    }

    const formBody = afterFormTag.substring(0, endFormIndex);
    const formEndTag = afterFormTag.substring(endFormIndex, endFormIndex + 7);

    const containerTags = ['div', 'center', 'p', 'section', 'article', 'aside', 'table', 'span'];
    let repairedBody = formBody;
    let prefixTags = '';

    for (const tag of containerTags) {
      const closeRegex = new RegExp(`</${tag}\\s*>`, 'gi');
      let closeMatch: RegExpExecArray | null;

      while ((closeMatch = closeRegex.exec(repairedBody)) !== null) {
        const textBeforeClose = repairedBody.substring(0, closeMatch.index);
        const openCount = (textBeforeClose.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
        const closeCount = (textBeforeClose.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;

        if (closeCount >= openCount) {
          prefixTags += closeMatch[0];
          repairedBody =
            repairedBody.substring(0, closeMatch.index) +
            repairedBody.substring(closeMatch.index + closeMatch[0].length);
          closeRegex.lastIndex = 0;
        }
      }
    }

    result += prefixTags + formTag + repairedBody + formEndTag;
    lastIndex = formStart + formTag.length + endFormIndex + formEndTag.length;
    formRegex.lastIndex = lastIndex;
  }

  result += rawHtml.substring(lastIndex);
  return result;
}

/**
 * Ensures all forms have an ID, and explicitly associates any orphaned submit buttons,
 * inputs, selects, or textareas with the nearest preceding form using HTML5 form="id".
 */
export function associateOrphanedFormElements($: cheerio.CheerioAPI): void {
  const formElements = $('form').toArray();
  if (formElements.length === 0) return;

  formElements.forEach((el, i) => {
    if (!$(el).attr('id')) {
      $(el).attr('id', `mediadeck-form-${i}`);
    }
  });

  $('button[type="submit"], input[type="submit"], button:not([type]), input, select, textarea').each((_, elem) => {
    const $elem = $(elem);
    if ($elem.closest('form').length === 0 && !$elem.attr('form')) {
      let targetForm = formElements[formElements.length - 1];
      let prev = $elem.prevAll('form').first();
      if (!prev.length) {
        let parent = $elem.parent();
        while (parent.length && !parent.is('body') && !parent.is('html')) {
          prev = parent.prevAll('form').first();
          if (prev.length) break;
          parent = parent.parent();
        }
      }
      if (prev.length) {
        targetForm = prev[0];
      }
      const formId = $(targetForm).attr('id');
      if (formId) {
        $elem.attr('form', formId);
      }
    }
  });
}
