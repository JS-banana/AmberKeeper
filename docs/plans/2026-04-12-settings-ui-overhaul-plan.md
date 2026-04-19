# Settings UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce Tailwind CSS + shadcn/ui component layer + lucide-react + Recharts, then rewrite UtilityNav, AboutPage, SettingsPage, LibraryPage for unified visual system.

**Architecture:** Install Tailwind + PostCSS in the existing electron-vite renderer pipeline. Copy 6 shadcn component source files (Button, Card, Select, Switch, Tooltip, Chart) into `components/ui/`. Prepend Tailwind directives + design tokens to `styles.css` head while keeping legacy rules intact below. Rewrite 3 utility pages top-down: UtilityNav+About → Settings → Library. Each phase deletes its consumed legacy CSS block.

**Tech Stack:** Tailwind CSS 3.4, shadcn/ui (source-copy, 6 components), @radix-ui/react-{slot,select,switch,tooltip}, lucide-react, Recharts 2, class-variance-authority, clsx, tailwind-merge

---

## Phase 1: Foundation + UtilityNav + AboutPage

### Task 1: Install dependencies

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Install production dependencies**

Run:
```bash
cd apps/desktop && pnpm add class-variance-authority clsx tailwind-merge lucide-react recharts @radix-ui/react-slot @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-tooltip
```
Expected: packages added to `dependencies` in `package.json`

**Step 2: Install dev dependencies**

Run:
```bash
cd apps/desktop && pnpm add -D tailwindcss@3 tailwindcss-animate autoprefixer
```
Expected: packages added to `devDependencies`

**Step 3: Verify install**

Run:
```bash
cd apps/desktop && pnpm ls tailwindcss lucide-react recharts @radix-ui/react-select
```
Expected: all 4 packages listed with version numbers

**Step 4: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: add tailwind, shadcn deps, lucide-react, recharts"
```

---

### Task 2: Configure Tailwind + PostCSS + path aliases

**Files:**
- Create: `apps/desktop/tailwind.config.ts`
- Modify: `apps/desktop/postcss.config.js`
- Modify: `apps/desktop/electron.vite.config.ts` (renderer.resolve.alias)
- Modify: `apps/desktop/tsconfig.json` (paths)
- Modify: `apps/desktop/vitest.config.ts` (alias)

**Step 1: Create tailwind.config.ts**

Create `apps/desktop/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
};

export default config;
```

**Step 2: Update postcss.config.js**

Replace `apps/desktop/postcss.config.js` content with:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 3: Add `@/*` path alias to electron.vite.config.ts**

In `apps/desktop/electron.vite.config.ts`, inside the `renderer` config object's `resolve.alias`, add one line:

```ts
// Inside renderer.resolve.alias, add:
'@': resolve(__dirname, 'src/renderer/src'),
```

**Step 4: Add `@/*` path to tsconfig.json**

In `apps/desktop/tsconfig.json`, add to `compilerOptions.paths`:

```json
"@/*": ["src/renderer/src/*"]
```

**Step 5: Add `@/*` alias to vitest.config.ts**

In `apps/desktop/vitest.config.ts`, add to `resolve.alias`:

```ts
'@': resolve(__dirname, 'src/renderer/src'),
```

**Step 6: Verify Tailwind compiles**

Run:
```bash
cd apps/desktop && npx tailwindcss --content './src/renderer/**/*.tsx' --output /dev/null
```
Expected: exits 0 without errors

**Step 7: Commit**

```bash
git add apps/desktop/tailwind.config.ts apps/desktop/postcss.config.js apps/desktop/electron.vite.config.ts apps/desktop/tsconfig.json apps/desktop/vitest.config.ts
git commit -m "build: configure tailwind, postcss, path aliases for renderer"
```

---

### Task 3: Add design tokens + Tailwind directives to styles.css

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: Prepend Tailwind directives and token layer**

Insert at the **very top** of `styles.css` (before the existing `:root {` block):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 36 33% 94%;
    --foreground: 26 22% 11%;
    --card: 0 0% 100%;
    --card-foreground: 26 22% 11%;
    --muted: 36 25% 88%;
    --muted-foreground: 30 12% 41%;
    --primary: 32 90% 49%;
    --primary-foreground: 0 0% 100%;
    --secondary: 36 33% 92%;
    --secondary-foreground: 26 22% 11%;
    --accent: 32 95% 41%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --border: 35 20% 84%;
    --input: 35 20% 84%;
    --ring: 32 90% 49%;
    --radius: 0.625rem;
  }
}

/* ===== LEGACY STYLES — delete per-section as pages are rewritten ===== */
```

All existing content below stays unchanged.

**Step 2: Verify dev server starts**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: Electron window opens, all existing pages look exactly the same as before (legacy CSS still active)

**Step 3: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all tests pass

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "style: add tailwind directives and amber design tokens to styles.css"
```

---

### Task 4: Create cn utility

**Files:**
- Create: `apps/desktop/src/renderer/src/lib/cn.ts`

**Step 1: Create the file**

Create `apps/desktop/src/renderer/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 2: Verify import resolves**

Run:
```bash
cd apps/desktop && npx tsc --noEmit src/renderer/src/lib/cn.ts 2>&1 | head -5
```
Expected: no type errors (or zero output)

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/lib/cn.ts
git commit -m "feat: add cn() tailwind-merge utility"
```

---

### Task 5: Create shadcn Button component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/button.tsx`

**Step 1: Create the component**

Create `apps/desktop/src/renderer/src/components/ui/button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent/10 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/button.tsx
git commit -m "feat(ui): add Button component (shadcn)"
```

---

### Task 6: Create shadcn Card component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/card.tsx`

**Step 1: Create the component**

Create `apps/desktop/src/renderer/src/components/ui/card.tsx`:

```tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/card.tsx
git commit -m "feat(ui): add Card component (shadcn)"
```

---

### Task 7: Create shadcn Select component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/select.tsx`

**Step 1: Create the component**

Create `apps/desktop/src/renderer/src/components/ui/select.tsx`:

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-card text-card-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent/10 focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/select.tsx
git commit -m "feat(ui): add Select component (shadcn + Radix)"
```

---

### Task 8: Create shadcn Switch component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/switch.tsx`

**Step 1: Create the component**

Create `apps/desktop/src/renderer/src/components/ui/switch.tsx`:

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitives.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = 'Switch';

export { Switch };
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/switch.tsx
git commit -m "feat(ui): add Switch component (shadcn + Radix)"
```

---

### Task 9: Create shadcn Tooltip component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/tooltip.tsx`

**Step 1: Create the component**

Create `apps/desktop/src/renderer/src/components/ui/tooltip.tsx`:

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/cn';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/tooltip.tsx
git commit -m "feat(ui): add Tooltip component (shadcn + Radix)"
```

---

### Task 10: Create Section and IconButton wrapper components

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/section.tsx`
- Create: `apps/desktop/src/renderer/src/components/ui/icon-button.tsx`

**Step 1: Create Section component**

Create `apps/desktop/src/renderer/src/components/ui/section.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('space-y-4', props.className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{props.title}</h2>
          {props.description && (
            <p className="text-sm text-muted-foreground mt-1">{props.description}</p>
          )}
        </div>
        {props.actions && <div className="flex items-center gap-2 shrink-0">{props.actions}</div>}
      </div>
      {props.children}
    </section>
  );
}
```

**Step 2: Create IconButton component**

Create `apps/desktop/src/renderer/src/components/ui/icon-button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'ghost' | 'outline' | 'secondary';
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, variant = 'ghost', className, children, ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant={variant}
          size="icon"
          aria-label={label}
          className={cn('shrink-0', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
);
IconButton.displayName = 'IconButton';

export { IconButton };
```

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/section.tsx apps/desktop/src/renderer/src/components/ui/icon-button.tsx
git commit -m "feat(ui): add Section and IconButton wrapper components"
```

---

### Task 11: Wrap App with TooltipProvider

**Files:**
- Modify: `apps/desktop/src/renderer/src/main.tsx`

**Step 1: Add TooltipProvider**

In `apps/desktop/src/renderer/src/main.tsx`, wrap `<App />` with `<TooltipProvider>`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TooltipProvider } from './components/ui/tooltip';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
```

**Step 2: Verify dev server runs**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: app starts normally, no console errors

**Step 3: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all tests pass

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/main.tsx
git commit -m "feat: wrap app with TooltipProvider for tooltip support"
```

---

### Task 12: Rewrite UtilityWorkbench nav with lucide icons

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

**Step 1: Replace WorkbenchGlyph + UtilityWorkbench nav with lucide icons and Tailwind classes**

In `apps/desktop/src/renderer/src/App.tsx`:

1. Add import: `import { Database, Settings, Info, Activity } from 'lucide-react';`
2. Add import: `import { cn } from '@/lib/cn';`
3. In `UtilityWorkbench`, replace the `menuItems` array icon values:
   - `library` → `<Database className="size-4" />`
   - `settings` → `<Settings className="size-4" />`
   - `about` → `<Info className="size-4" />`
   - `diagnostics` → `<Activity className="size-4" />`
4. Replace the `<nav>` and `<button>` elements to use Tailwind classes:

Replace the entire `<nav>` block (lines 113-135) with:

```tsx
<nav className="flex flex-col gap-1 w-[180px] shrink-0 border-r border-border bg-background/60 p-3 overflow-y-auto" aria-label="工作台导航">
  {menuItems.map((item) => {
    const isActive = currentSurface === item.id;
    return (
      <button
        key={item.id}
        type="button"
        aria-pressed={isActive}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-150',
          'hover:text-foreground hover:bg-secondary/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'text-foreground bg-secondary shadow-sm relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-primary'
        )}
        onClick={() => props.onSelectSurface(item.id)}
      >
        <span className="shrink-0" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    );
  })}
</nav>
```

5. Delete the entire `WorkbenchGlyph` function (lines 201-280).

**Step 2: Verify visually**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: left nav shows 4 items with lucide icons, active item highlighted with amber left bar

**Step 3: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all tests pass

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx
git commit -m "refactor: replace hand-rolled SVG nav icons with lucide-react"
```

---

### Task 13: Rewrite AboutPage

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/AboutPage.tsx`

**Step 1: Rewrite AboutPage to minimal tool-style**

Replace the entire content of `apps/desktop/src/renderer/src/pages/AboutPage.tsx`:

```tsx
import type { ShellInfo } from '@amberkeeper/shared-types';
import { Github, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROJECT_URL = 'https://github.com/JS-banana/amberkeeper';
const FEEDBACK_URL = 'https://github.com/JS-banana/amberkeeper/issues';

export function AboutPage(props: { shellInfo: ShellInfo | null }) {
  const version = props.shellInfo?.appVersion ?? '开发环境';
  const mode = props.shellInfo?.isPackaged ? '已打包应用' : '开发模式';

  return (
    <section className="flex flex-col items-center justify-center flex-1 min-h-0 px-6 py-12">
      <div className="flex flex-col items-center text-center gap-3 mb-10">
        <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
          A
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AmberKeeper</h1>
          <p className="text-sm text-muted-foreground mt-1">
            多 AI Provider 本地对话工作台
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8 w-full max-w-xs">
        <MetaCard label="当前版本" value={version} />
        <MetaCard label="运行形态" value={mode} />
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <a href={PROJECT_URL} target="_blank" rel="noreferrer">
            <Github className="size-4 mr-2" />
            GitHub 项目
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            <Bug className="size-4 mr-2" />
            反馈问题
          </a>
        </Button>
      </div>
    </section>
  );
}

function MetaCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="text-base font-semibold tabular-nums mt-1 text-foreground">{props.value}</div>
    </div>
  );
}
```

**Step 2: Delete legacy About CSS**

In `apps/desktop/src/renderer/src/styles.css`, find and delete the entire `.about-page` block (approx lines 1027-1082, search for `.about-page` to find start, delete through the last `.about-page__` rule). Also delete `.primary-button` and `.secondary-button` rules if they are only used by AboutPage (check grep first).

Run:
```bash
cd apps/desktop && grep -rn 'primary-button\|secondary-button' src/renderer/src/ --include='*.tsx' | grep -v AboutPage | grep -v node_modules
```
If other files still use `primary-button` / `secondary-button`, keep those CSS rules. If not, delete them too.

**Step 3: Verify visually**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: About page shows centered logo mark + title + subtitle + 2 meta cards + 2 buttons. Clean, minimal.

**Step 4: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all tests pass

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/AboutPage.tsx apps/desktop/src/renderer/src/styles.css
git commit -m "refactor: rewrite AboutPage to minimal tool-style with Tailwind + Button"
```

---

### Task 14: Delete legacy UtilityWorkbench nav CSS

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: Delete utility-workbench nav styles**

In `styles.css`, delete these class blocks (keep the body/layout rules that other surfaces still use):
- `.utility-workbench__nav` (line ~316-329)
- `.utility-workbench__tab` (line ~331-353)
- `.utility-workbench__tab:hover, .utility-workbench__tab:focus-visible` (line ~355-359)
- `.utility-workbench__tab.active` (line ~361-365)
- `.utility-workbench__tab-icon` (line ~367-374)
- `.utility-workbench__tab-label` (line ~376-378)
- `.utility-workbench__glyph` (line ~380-383)

Keep `.utility-workbench`, `.utility-workbench--sidebar`, `.utility-workbench__body`, `.utility-workbench__body--library` since they're still used by the outer layout.

**Step 2: Verify dev server**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: nav still renders correctly via Tailwind classes

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "style: remove legacy utility-workbench nav and about-page CSS"
```

---

## Phase 2: SettingsPage

### Task 15: Rewrite SettingsPage with new components

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/SettingsPage.tsx`

**Step 1: Rewrite SettingsPage**

Replace the entire content of `apps/desktop/src/renderer/src/pages/SettingsPage.tsx`:

```tsx
import { useState, type DragEvent } from 'react';
import type {
  InterfaceLanguage,
  ProviderMoveDirection,
  ProviderRecord,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { GripVertical, Eye, EyeOff, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Section } from '@/components/ui/section';
import { IconButton } from '@/components/ui/icon-button';
import { ProviderIcon } from '../components/ProviderIcon';

const LANGUAGE_OPTIONS: Array<{ value: InterfaceLanguage; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export function SettingsPage(props: {
  shellInfo: ShellInfo | null;
  providers: ProviderRecord[];
  activeProviderId: string | null;
  onSetInterfaceLanguage: (language: InterfaceLanguage) => Promise<void> | void;
  onSelectProvider: (providerId: ProviderRecord['id']) => void;
  onToggleProvider: (providerId: ProviderRecord['id'], enabled: boolean) => void;
  onToggleProviderCache: (providerId: ProviderRecord['id'], enabled: boolean) => void;
  onMoveProvider: (
    providerId: ProviderRecord['id'],
    direction: ProviderMoveDirection
  ) => Promise<void> | void;
}) {
  const [draggingProviderId, setDraggingProviderId] = useState<ProviderRecord['id'] | null>(null);
  const [dropTargetProviderId, setDropTargetProviderId] = useState<ProviderRecord['id'] | null>(null);
  const [reordering, setReordering] = useState(false);

  function startDragging(providerId: ProviderRecord['id'], event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData('text/provider-id', providerId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingProviderId(providerId);
  }

  async function reorderProvider(
    sourceProviderId: ProviderRecord['id'],
    targetProviderId: ProviderRecord['id']
  ) {
    if (sourceProviderId === targetProviderId) return;
    const sourceIndex = props.providers.findIndex((p) => p.id === sourceProviderId);
    const targetIndex = props.providers.findIndex((p) => p.id === targetProviderId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const direction: ProviderMoveDirection = sourceIndex < targetIndex ? 'down' : 'up';
    const moveCount = Math.abs(targetIndex - sourceIndex);

    setReordering(true);
    try {
      for (let i = 0; i < moveCount; i += 1) {
        await props.onMoveProvider(sourceProviderId, direction);
      }
    } finally {
      setReordering(false);
      setDraggingProviderId(null);
      setDropTargetProviderId(null);
    }
  }

  return (
    <div className="flex flex-col gap-10 max-w-3xl py-2">
      {/* --- 服务管理 --- */}
      <Section
        title="服务管理"
        description="管理已接入的 AI 服务，拖拽调整顺序。"
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button disabled className="opacity-50">
                <Plus className="size-4 mr-2" />添加服务
              </Button>
            </TooltipTrigger>
            <TooltipContent>即将支持自定义 Provider</TooltipContent>
          </Tooltip>
        }
      >
        <ol className="space-y-2" aria-label="服务列表">
          {props.providers.map((provider) => {
            const isDragging = draggingProviderId === provider.id;
            const isDropTarget = dropTargetProviderId === provider.id;
            const isActive = provider.id === props.activeProviderId;

            return (
              <li
                key={provider.id}
                draggable={!reordering}
                onDragStart={(e) => startDragging(provider.id, e)}
                onDragEnd={() => { setDraggingProviderId(null); setDropTargetProviderId(null); }}
                onDragOver={(e) => { e.preventDefault(); if (!reordering) setDropTargetProviderId(provider.id); }}
                onDragLeave={() => { if (dropTargetProviderId === provider.id) setDropTargetProviderId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData('text/provider-id') as ProviderRecord['id'];
                  if (sourceId) void reorderProvider(sourceId, provider.id);
                }}
              >
                <Card
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-all duration-150 cursor-grab active:cursor-grabbing',
                    isActive && 'ring-2 ring-primary/30 bg-primary/5',
                    isDragging && 'opacity-50 scale-[0.98]',
                    isDropTarget && 'border-t-2 border-t-primary',
                    !provider.enabled && 'opacity-60'
                  )}
                >
                  <GripVertical className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />

                  <ProviderIcon
                    providerId={provider.id}
                    providerName={provider.name}
                    homeUrl={provider.homeUrl}
                    className="size-8 shrink-0"
                  />

                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-pressed={isActive}
                    aria-label={isActive ? `当前服务 ${provider.name}` : `切换到 ${provider.name}`}
                    onClick={() => props.onSelectProvider(provider.id)}
                  >
                    <div className="text-sm font-semibold text-foreground truncate">{provider.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{provider.homeUrl}</div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={provider.cacheEnabled}
                      onCheckedChange={(checked) => props.onToggleProviderCache(provider.id, checked)}
                      aria-label={`${provider.name} 本地缓存`}
                    />

                    <IconButton
                      label={provider.enabled ? `停用 ${provider.name}` : `启用 ${provider.name}`}
                      onClick={() => props.onToggleProvider(provider.id, !provider.enabled)}
                    >
                      {provider.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* --- 外观与语言 --- */}
      <Section title="外观与语言">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-foreground" id="lang-label">
            界面语言
          </label>
          <Select
            value={props.shellInfo?.interfaceLanguage ?? 'system'}
            onValueChange={(value) => {
              void props.onSetInterfaceLanguage(value as InterfaceLanguage);
            }}
          >
            <SelectTrigger className="w-48" aria-labelledby="lang-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>
    </div>
  );
}
```

**Step 2: Verify visually**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: Settings page shows "服务管理" section with provider cards + drag handles + brand icons + Switch + eye icons. Below it "外观与语言" with a Select dropdown (not native browser select).

**Step 3: Run tests — expect failures**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: `SettingsPage.test.tsx` may fail because query selectors changed. We fix this in next task.

**Step 4: Commit (even if tests fail — we fix tests next)**

```bash
git add apps/desktop/src/renderer/src/pages/SettingsPage.tsx
git commit -m "refactor: rewrite SettingsPage with Tailwind + shadcn components"
```

---

### Task 16: Update SettingsPage tests

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/SettingsPage.test.tsx`

**Step 1: Update test queries**

Update `apps/desktop/src/renderer/src/pages/SettingsPage.test.tsx`. Key changes needed:

1. Wrap render in `<TooltipProvider>` (Radix requires provider):
```tsx
import { TooltipProvider } from '../components/ui/tooltip';
// Inside render():
render(
  <TooltipProvider>
    <SettingsPage ... />
  </TooltipProvider>
);
```

2. Update heading queries — "界面语言" is now inside a `<Section>` `<h2>`, should still work. "服务管理" same.

3. The "缓存" text no longer appears as inline label (we removed the `<span>缓存</span>`), so delete the assertion `expect(screen.getAllByText('缓存').length).toBeGreaterThan(0)`.

4. The language `<select>` is now a Radix Select (not native combobox). Change:
   - Old: `fireEvent.change(screen.getByRole('combobox', { name: '界面语言' }), { target: { value: 'zh-CN' } })`
   - New: Since Radix Select doesn't use native `<select>`, we need to test differently. The SelectTrigger has `aria-labelledby="lang-label"`. We can click the trigger, then click the item.

```tsx
// Replace the language test section:
const langTrigger = screen.getByRole('combobox');
fireEvent.click(langTrigger);
// Radix Select items should appear
const zhOption = screen.getByRole('option', { name: '简体中文' });
fireEvent.click(zhOption);
expect(onSetInterfaceLanguage).toHaveBeenCalledWith('zh-CN');
```

5. Switch queries stay as `getByRole('switch', { name: '...' })` since Radix Switch also uses `role="switch"`. But `aria-checked` is now `data-state` on Radix; use `toBeChecked()` matcher instead:
```tsx
expect(screen.getByRole('switch', { name: 'ChatGPT 本地缓存' })).toBeChecked();
expect(screen.getByRole('switch', { name: 'Claude 本地缓存' })).not.toBeChecked();
```

6. Visibility button: now uses `IconButton` with `<Tooltip>`. aria-label stays same ("停用 ChatGPT") so the query should still work.

**Step 2: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/SettingsPage.test.tsx
git commit -m "test: update SettingsPage tests for shadcn components"
```

---

### Task 17: Delete legacy Settings CSS

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: Delete settings CSS blocks**

In `styles.css`, find and delete all blocks with selectors containing:
- `.settings-page`
- `.settings-section`
- `.settings-section__header`
- `.settings-row`
- `.settings-list`
- `.settings-item` (and all `--drop-target`, `--dragging`, `--disabled` modifiers)
- `.settings-item__meta`, `.settings-item__select`, `.settings-item__summary`, `.settings-item__headline`, `.settings-item__subtitle`, `.settings-item__actions`
- `.settings-cache-control`, `.settings-cache-control__label`
- `.settings-switch`, `.settings-switch--active`, `.settings-switch__thumb`
- `.settings-drag-handle`
- `.icon-button`, `.icon-button--active`
- `.mini-icon`

Search for each in the file to find exact line ranges.

**Step 2: Verify visually**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: Settings page renders correctly without legacy CSS

**Step 3: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all pass

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "style: remove legacy settings CSS (replaced by Tailwind)"
```

---

## Phase 3: LibraryPage

### Task 18: Create Chart wrapper component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ui/chart.tsx`

**Step 1: Create minimal chart wrapper**

Create `apps/desktop/src/renderer/src/components/ui/chart.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function ChartContainer(props: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('w-full', props.className)}>
      {props.children}
    </div>
  );
}
```

> We keep this minimal — Recharts handles its own responsive sizing. This is mainly a style wrapper for consistent padding/border treatment.

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/ui/chart.tsx
git commit -m "feat(ui): add ChartContainer wrapper for Recharts"
```

---

### Task 19: Create CaptureTrendChart component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/library/CaptureTrendChart.tsx`

**Step 1: Create trend chart**

Create `apps/desktop/src/renderer/src/components/library/CaptureTrendChart.tsx`:

```tsx
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CaptureTrendChart(props: { sessions: CaptureSessionRecord[] }) {
  const data = useMemo(() => {
    const now = new Date();
    const days: Array<{ date: string; count: number }> = [];
    const countMap = new Map<string, number>();

    for (const session of props.sessions) {
      const d = session.createdAt.slice(0, 10); // 'YYYY-MM-DD'
      countMap.set(d, (countMap.get(d) ?? 0) + 1);
    }

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: countMap.get(key) ?? 0 });
    }

    return days;
  }, [props.sessions]);

  const hasData = data.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">30 天会话趋势</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fillAmber" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(32, 90%, 49%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(32, 90%, 49%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)} // 'MM-DD'
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '0.5rem',
                  border: '1px solid hsl(35, 20%, 84%)',
                  fontSize: '0.875rem',
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="会话数"
                stroke="hsl(32, 90%, 49%)"
                strokeWidth={2}
                fill="url(#fillAmber)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-sm">
            <p>还没有任何会话</p>
            <p className="text-xs mt-1">去任意 provider 开始第一次对话</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/library/CaptureTrendChart.tsx
git commit -m "feat: add CaptureTrendChart (30-day session trend area chart)"
```

---

### Task 20: Create ProviderShareChart component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/library/ProviderShareChart.tsx`

**Step 1: Create horizontal bar chart for provider share**

Create `apps/desktop/src/renderer/src/components/library/ProviderShareChart.tsx`:

```tsx
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { CaptureSessionRecord, ProviderRecord } from '@amberkeeper/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PROVIDER_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  claude: '#cc785c',
  gemini: '#4285f4',
  deepseek: '#4d6bfe',
  grok: '#000000',
  kimi: '#6366f1',
  qianwen: '#615cee',
  doubao: '#3370ff',
  'xiaomi-aistudio': '#ff6900',
};

export function ProviderShareChart(props: {
  sessions: CaptureSessionRecord[];
  providers: ProviderRecord[];
}) {
  const data = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const s of props.sessions) {
      countMap.set(s.provider, (countMap.get(s.provider) ?? 0) + 1);
    }

    return props.providers
      .filter((p) => p.enabled)
      .map((p) => ({
        name: p.name,
        providerId: p.id,
        count: countMap.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [props.sessions, props.providers]);

  const hasData = data.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Provider 占比</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36)}>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '0.5rem',
                  border: '1px solid hsl(35, 20%, 84%)',
                  fontSize: '0.875rem',
                }}
              />
              <Bar dataKey="count" name="会话数" radius={[0, 4, 4, 0]} barSize={20} label={{ position: 'right', className: 'text-xs fill-muted-foreground' }}>
                {data.map((entry) => (
                  <Cell key={entry.providerId} fill={PROVIDER_COLORS[entry.providerId] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[120px] text-muted-foreground text-sm">
            暂无数据
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/library/ProviderShareChart.tsx
git commit -m "feat: add ProviderShareChart (horizontal bar by provider)"
```

---

### Task 21: Rewrite LibraryPage overview section

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`

**Step 1: Rewrite LibraryPage**

This is the most complex rewrite. The key changes:

1. Add imports at top:
```tsx
import { LayoutGrid, RefreshCw, Download } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';
import { CaptureTrendChart } from '../components/library/CaptureTrendChart';
import { ProviderShareChart } from '../components/library/ProviderShareChart';
```

2. Replace the `exportAndSyncTools` block with a new component using shadcn `<Select>` and `<Button>`:
   - Replace native `<select aria-label="选择要导出的服务">` with `<Select value={providerExportTarget} onValueChange={setProviderExportTarget}>`
   - Replace native `<select aria-label="选择导出格式">` with `<Select value={providerExportFormat} onValueChange={setProviderExportFormat}>`
   - Replace `<IconActionButton>` refresh/export with `<IconButton>` + `<Button>`

3. Replace the provider tabs section (lines 188-235) with unified pill group:
   - All items: icon + text, same padding/height
   - "全部" button: `<LayoutGrid className="size-4" />` + "全部"
   - Provider buttons: `<ProviderIcon ... className="size-4" />` + `provider.name`

4. Replace `LibraryOverview` with new layout:
   - 4 KPI cards in grid
   - `<CaptureTrendChart>` (main chart)
   - `<ProviderShareChart>` (side chart)
   - Export card at bottom

5. Delete `IconActionButton`, `ExportIcon`, `RefreshIcon` local functions.

The full rewrite is too large to inline here. The key structural pattern:

```tsx
{props.historyScope === 'all' ? (
  <div className="flex flex-col gap-6 p-2">
    {/* KPI Cards */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard icon={<MessagesSquare />} label="总会话数" value={props.sessions.length} />
      <KpiCard icon={<Server />} label="接入服务" value={enabledProviders.length} />
      <KpiCard icon={<TrendingUp />} label="今日新增" value={todayCount} />
      <KpiCard icon={<Database />} label="缓存服务" value={`${cachedCount}/${enabledProviders.length}`} />
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <CaptureTrendChart sessions={props.sessions} />
      </div>
      <ProviderShareChart sessions={props.sessions} providers={props.providers} />
    </div>

    {/* Export Panel */}
    <Card>...</Card>
  </div>
) : (
  <div className="library-grid">
    {/* existing ConversationList + ConversationMessagePane — keep as-is */}
  </div>
)}
```

Note: `KpiCard` is a local helper:
```tsx
function KpiCard(props: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="text-primary">{props.icon}</span>
          {props.label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {typeof props.value === 'number' ? props.value.toLocaleString() : props.value}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verify visually**

Run:
```bash
cd apps/desktop && pnpm dev
```
Expected: "数据" page "全部" view shows KPI cards + trend chart + provider bar chart + export panel. Selecting a specific provider shows the existing conversation list.

**Step 3: Run tests**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all pass (LibraryPage doesn't have its own test file)

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/LibraryPage.tsx
git commit -m "refactor: rewrite LibraryPage overview with KPI cards, trend chart, provider share chart"
```

---

### Task 22: Delete legacy Library CSS

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Step 1: Delete library CSS blocks**

In `styles.css`, find and delete all blocks with selectors containing:
- `.library-page__provider-tabs`, `.library-page__provider-tab`
- `.library-page__toolbar`, `.library-page__toolbar-actions`
- `.library-page__feedback`
- `.library-page__provider-icon`
- `.library-overview-dashboard` (all sub-selectors)
- `.stat-card` (all sub-selectors)
- `.field-select`, `.field-select--compact`
- `.secondary-icon-button`
- `.button-icon`

Keep `.library-grid` and `.library-page__top` if still used by the conversation list layout.

**Step 2: Verify visually + run tests**

Run:
```bash
cd apps/desktop && pnpm dev
```
```bash
cd apps/desktop && pnpm test
```
Expected: both pass

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/styles.css
git commit -m "style: remove legacy library overview and field-select CSS"
```

---

### Task 23: Final verification

**Step 1: Run full test suite**

Run:
```bash
cd apps/desktop && pnpm test
```
Expected: all tests pass

**Step 2: Run type check**

Run:
```bash
cd apps/desktop && npx tsc --noEmit
```
Expected: no type errors

**Step 3: Visual walkthrough**

Run:
```bash
cd apps/desktop && pnpm dev
```

Check all surfaces:
- [ ] 左侧菜单：active 高亮 + focus ring + 键盘 Tab
- [ ] 设置 → 服务管理：拖拽排序 + Switch 缓存 + Eye 可见性 + disabled 添加服务 tooltip
- [ ] 设置 → 外观与语言：Select 弹出 + 值切换
- [ ] 数据 → 全部：4 KPI 卡 + AreaChart 趋势 + BarChart 占比 + 空数据 EmptyState + 导出 Select + 导出按钮
- [ ] 数据 → 单 provider：ConversationList 仍正常
- [ ] 关于：版本卡 + 链接按钮

**Step 4: Commit any fixes**

If anything broke, fix and commit.

**Step 5: Save plan copy to docs/**

```bash
cp ~/.claude/plans/sparkling-exploring-tiger.md docs/plans/2026-04-12-settings-ui-overhaul-plan.md
git add docs/plans/2026-04-12-settings-ui-overhaul-plan.md
git commit -m "docs: add settings UI overhaul implementation plan"
```

---

## Summary

| Phase | Tasks | Files Created | Files Modified |
|-------|-------|---------------|----------------|
| Phase 1: Foundation + Nav + About | Tasks 1-14 | 10 new files | 6 files |
| Phase 2: Settings | Tasks 15-17 | 0 | 3 files |
| Phase 3: Library | Tasks 18-23 | 3 new files | 2 files |
| **Total** | **23 tasks** | **13 new files** | **11 files** |
