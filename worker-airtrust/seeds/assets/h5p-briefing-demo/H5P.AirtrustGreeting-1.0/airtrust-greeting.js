(function (H5P) {
  function AirtrustGreeting(params, contentId) {
    this.params = Object.assign(
      {
        title: 'Briefing Operacional',
        intro: 'Revise os pontos críticos e finalize o briefing.',
        checklist: [],
        completionLabel: 'Registrar briefing como concluído',
        completionMessage: 'Briefing concluído com sucesso.',
        accentColor: '#0f766e',
      },
      params || {},
    );
    this.contentId = contentId;
    this.completed = false;
    this.progressed = false;
  }

  AirtrustGreeting.prototype.getContainer = function ($container) {
    if (!$container) return null;
    if (typeof $container.get === 'function') return $container.get(0);
    if ($container[0]) return $container[0];
    return $container;
  };

  AirtrustGreeting.prototype.dispatchStatement = function (verbId, display, result) {
    var statement = {
      actor: {
        objectType: 'Agent',
        name: 'Learner',
      },
      verb: {
        id: verbId,
        display: {
          'en-US': display,
          'pt-BR': display,
        },
      },
      object: {
        id: 'https://airtrust.app/h5p/airtrust-greeting/' + this.contentId,
        objectType: 'Activity',
        definition: {
          type: 'http://adlnet.gov/expapi/activities/lesson',
          name: {
            'pt-BR': this.params.title,
            'en-US': this.params.title,
          },
          description: {
            'pt-BR': this.params.intro,
            'en-US': this.params.intro,
          },
        },
      },
      result: result,
      timestamp: new Date().toISOString(),
    };

    try {
      if (
        window.H5P &&
        window.H5P.externalDispatcher &&
        typeof window.H5P.externalDispatcher.trigger === 'function'
      ) {
        window.H5P.externalDispatcher.trigger('xAPI', { data: { statement: statement } });
      }
    } catch (error) {
      // no-op
    }

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ statement: statement }, '*');
      }
    } catch (error) {
      // no-op
    }
  };

  AirtrustGreeting.prototype.attach = function ($container) {
    var self = this;
    var container = this.getContainer($container);
    if (!container) return;

    var accent = this.params.accentColor || '#0f766e';
    var checklist = Array.isArray(this.params.checklist) ? this.params.checklist : [];

    container.innerHTML = '';

    var root = document.createElement('section');
    root.className = 'airtrust-h5p';
    root.style.setProperty('--airtrust-accent', accent);

    var hero = document.createElement('div');
    hero.className = 'airtrust-h5p__hero';
    hero.style.background = 'linear-gradient(135deg, ' + accent + ' 0%, #0f172a 100%)';
    hero.innerHTML =
      '<span class="airtrust-h5p__eyebrow">AirTrust H5P Demo</span>' + '<h2></h2>' + '<p></p>';
    hero.querySelector('h2').textContent = this.params.title;
    hero.querySelector('p').textContent = this.params.intro;

    var body = document.createElement('div');
    body.className = 'airtrust-h5p__body';

    var progress = document.createElement('div');
    progress.className = 'airtrust-h5p__progress';
    progress.innerHTML =
      '<div class="airtrust-h5p__progress-track"><div class="airtrust-h5p__progress-fill"></div></div>' +
      '<span class="airtrust-h5p__progress-label">0%</span>';

    var list = document.createElement('ul');
    list.className = 'airtrust-h5p__list';

    checklist.forEach(function (item, index) {
      var row = document.createElement('li');
      row.className = 'airtrust-h5p__item';

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'airtrust-h5p-item-' + index;

      var label = document.createElement('label');
      label.setAttribute('for', checkbox.id);

      var text = document.createElement('span');
      text.textContent = item && item.text ? item.text : 'Item do briefing';

      label.appendChild(text);
      row.appendChild(checkbox);
      row.appendChild(label);
      list.appendChild(row);
    });

    var actions = document.createElement('div');
    actions.className = 'airtrust-h5p__actions';

    var button = document.createElement('button');
    button.className = 'airtrust-h5p__button';
    button.disabled = checklist.length > 0;
    button.style.background = accent;
    button.textContent = this.params.completionLabel;

    var message = document.createElement('p');
    message.className = 'airtrust-h5p__message';
    message.textContent = this.params.completionMessage;

    actions.appendChild(button);
    body.appendChild(progress);
    body.appendChild(list);
    body.appendChild(actions);
    body.appendChild(message);

    root.appendChild(hero);
    root.appendChild(body);
    container.appendChild(root);

    var fill = progress.querySelector('.airtrust-h5p__progress-fill');
    var label = progress.querySelector('.airtrust-h5p__progress-label');
    var checkboxes = Array.prototype.slice.call(list.querySelectorAll('input[type="checkbox"]'));

    var syncProgress = function () {
      var checked = checkboxes.filter(function (checkbox) {
        return checkbox.checked;
      }).length;
      var pct = checkboxes.length === 0 ? 100 : Math.round((checked / checkboxes.length) * 100);

      fill.style.width = pct + '%';
      fill.style.background = accent;
      label.textContent = pct + '%';
      button.disabled = checked !== checkboxes.length;

      if (checked > 0 && !self.progressed) {
        self.progressed = true;
        self.dispatchStatement('http://adlnet.gov/expapi/verbs/progressed', 'progressed', {
          completion: false,
          score: {
            min: 0,
            max: 100,
            raw: pct,
            scaled: pct / 100,
          },
        });
      }
    };

    checkboxes.forEach(function (checkbox) {
      checkbox.addEventListener('change', syncProgress);
    });

    button.addEventListener('click', function () {
      if (self.completed || button.disabled) return;

      self.completed = true;
      button.disabled = true;
      message.classList.add('is-visible');

      self.dispatchStatement('http://adlnet.gov/expapi/verbs/completed', 'completed', {
        completion: true,
        success: true,
        score: {
          min: 0,
          max: 100,
          raw: 100,
          scaled: 1,
        },
      });
    });

    syncProgress();
    this.dispatchStatement('http://adlnet.gov/expapi/verbs/initialized', 'initialized', {
      completion: false,
      score: {
        min: 0,
        max: 100,
        raw: 0,
        scaled: 0,
      },
    });
  };

  H5P.AirtrustGreeting = AirtrustGreeting;
})(H5P);
