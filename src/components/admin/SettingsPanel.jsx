import { useEffect, useRef, useState } from 'react';
import BusinessCitiesPanel from './BusinessCitiesPanel';
import TransactionMethodsPanel from './TransactionMethodsPanel';
import ExpenseCategoriesPanel from './ExpenseCategoriesPanel';
import './SettingsPanel.css';

const SETTINGS_SECTIONS = [
  {
    id: 'cities',
    title: 'Business cities',
    description: 'Add or edit cities used in account forms and location dropdowns.',
    actionLabel: 'Add city',
  },
  {
    id: 'methods',
    title: 'Transaction methods',
    description: 'Manage payment methods for direct sales, receipts, and orders.',
    actionLabel: 'Add method',
  },
  {
    id: 'expense-categories',
    title: 'Expense categories',
    description: 'Define categories used when recording shop expenses (admin only).',
    actionLabel: 'Add category',
  },
];

export default function SettingsPanel() {
  const [activeView, setActiveView] = useState(null);
  const citiesInputRef = useRef(null);
  const methodsInputRef = useRef(null);
  const expenseCategoriesInputRef = useRef(null);

  const inputRefs = {
    cities: citiesInputRef,
    methods: methodsInputRef,
    'expense-categories': expenseCategoriesInputRef,
  };

  useEffect(() => {
    if (!activeView) return undefined;
    const frame = requestAnimationFrame(() => {
      inputRefs[activeView]?.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeView]);

  const openView = (sectionKey) => {
    setActiveView(sectionKey);
  };

  const backToActions = () => {
    setActiveView(null);
  };

  if (activeView === 'cities') {
    return (
      <div className="wh-dash-wrap wh-settings-wrap wh-settings-wrap--detail">
        <BusinessCitiesPanel addInputRef={citiesInputRef} onBackToActions={backToActions} />
      </div>
    );
  }

  if (activeView === 'methods') {
    return (
      <div className="wh-dash-wrap wh-settings-wrap wh-settings-wrap--detail">
        <TransactionMethodsPanel addInputRef={methodsInputRef} onBackToActions={backToActions} />
      </div>
    );
  }

  if (activeView === 'expense-categories') {
    return (
      <div className="wh-dash-wrap wh-settings-wrap wh-settings-wrap--detail">
        <ExpenseCategoriesPanel
          addInputRef={expenseCategoriesInputRef}
          onBackToActions={backToActions}
        />
      </div>
    );
  }

  return (
    <div className="wh-dash-wrap wh-settings-wrap">
      <section className="wh-panel wh-settings-actions" aria-label="Settings actions">
        <div className="wh-section-head">
          <h3>Actions</h3>
        </div>
        <p className="wh-setup-form-panel__hint">
          Choose a setting to configure. The form opens on its own page when you select an action.
        </p>
        <div className="wh-settings-actions__grid">
          {SETTINGS_SECTIONS.map((item) => (
            <article key={item.id} className="wh-settings-action-card">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
              <button
                type="button"
                className="wh-hero__btn wh-settings-action-card__btn"
                onClick={() => openView(item.id)}
              >
                {item.actionLabel}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
