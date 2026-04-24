import { honoRender } from '@wpm/util/test';
import { describe, it, expect } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuSub,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuShortcut,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem,
} from './dropdown-menu';

describe('DropdownMenu Components (Hono SSR)', () => {
  describe('DropdownMenu', () => {
    it('should wrap children in Island and wpm-dropdown-menu', () => {
      const node = (
        <DropdownMenu>
          <div>Test Child</div>
        </DropdownMenu>
      );
      const finalNode = honoRender(node);

      expect(finalNode).toMatchSnapshot();
    });
  });

  describe('DropdownMenuPortal', () => {
    it('should unwrap children through Fragment', () => {
      const node = (
        <DropdownMenuPortal>
          <div id="portal-child">Portal Content</div>
        </DropdownMenuPortal>
      );
      const finalNode = honoRender(node);

      expect(finalNode).toMatchSnapshot();
    });
  });

  describe('DropdownMenuTrigger', () => {
    it('should render a button with correct default attributes', () => {
      const node = <DropdownMenuTrigger className="custom-trigger">Click Me</DropdownMenuTrigger>;
      const finalNode = honoRender(node);

      expect(finalNode.tag).toBe('button');
      expect(finalNode.props.type).toBe('button');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-trigger');
      expect(finalNode.props['aria-haspopup']).toBe('menu');
      expect(finalNode.props['aria-expanded']).toBe('false');
      expect(finalNode.props['data-state']).toBe('closed');

      const styles = finalNode.props.class || finalNode.props.className;
      expect(styles).toContain('custom-trigger');
    });

    it('should merge props onto a child element when asChild is true', () => {
      const node = (
        <DropdownMenuTrigger asChild>
          <div id="custom-child">Custom Trigger</div>
        </DropdownMenuTrigger>
      );
      const finalNode = honoRender(node);

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.id).toBe('custom-child');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-trigger');
      expect(finalNode.props['aria-haspopup']).toBe('menu');
    });
  });

  describe('DropdownMenuContent', () => {
    it('should render with default sideOffset and align props', () => {
      const node = <DropdownMenuContent>Content</DropdownMenuContent>;
      const finalNode = honoRender(node);

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-content');
      expect(finalNode.props['data-state']).toBe('closed');
      expect(finalNode.props['data-side-offset']).toBe(4);
      expect(finalNode.props['data-align']).toBe('start');

      const styles = finalNode.props.class || finalNode.props.className;
      expect(styles).toContain('bg-popover');
    });

    it('should accept custom sideOffset and align props', () => {
      const node = (
        <DropdownMenuContent sideOffset={12} align="end">
          Content
        </DropdownMenuContent>
      );
      const finalNode = honoRender(node);

      expect(finalNode.props['data-side-offset']).toBe(12);
      expect(finalNode.props['data-align']).toBe('end');
    });

    it('should match snapshot to verify complex tailwind classes', () => {
      const node = <DropdownMenuContent className="custom-class">Content</DropdownMenuContent>;
      expect(honoRender(node)).toMatchSnapshot();
    });
  });

  describe('DropdownMenuGroup & DropdownMenuRadioGroup', () => {
    it('should render DropdownMenuGroup with role group', () => {
      const node = <DropdownMenuGroup id="group-1">Group Items</DropdownMenuGroup>;
      const finalNode = honoRender(node);

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.role).toBe('group');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-group');
    });

    it('should render DropdownMenuRadioGroup with role group', () => {
      const node = <DropdownMenuRadioGroup>Radio Items</DropdownMenuRadioGroup>;
      const finalNode = honoRender(node);

      expect(finalNode.props.role).toBe('group');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-radio-group');
    });
  });

  describe('DropdownMenuItem', () => {
    it('should render with default attributes', () => {
      const node = <DropdownMenuItem>Item 1</DropdownMenuItem>;
      const finalNode = honoRender(node);

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.role).toBe('menuitem');
      expect(finalNode.props.tabIndex).toBe(-1);
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-item');
      expect(finalNode.props['data-variant']).toBe('default');
      expect(finalNode.props['data-inset']).toBeUndefined();
      expect(finalNode.props['data-disabled']).toBeUndefined();
    });

    it('should handle inset prop', () => {
      const node = <DropdownMenuItem inset>Item</DropdownMenuItem>;
      const finalNode = honoRender(node);
      expect(finalNode.props['data-inset']).toBe('true');
    });

    it('should handle disabled prop', () => {
      const node = <DropdownMenuItem disabled>Item</DropdownMenuItem>;
      const finalNode = honoRender(node);
      expect(finalNode.props['data-disabled']).toBe('true');
      expect(finalNode.props['aria-disabled']).toBe('true');
    });

    it('should handle destructive variant', () => {
      const node = <DropdownMenuItem variant="destructive">Item</DropdownMenuItem>;
      const finalNode = honoRender(node);
      expect(finalNode.props['data-variant']).toBe('destructive');
    });
  });

  describe('DropdownMenuCheckboxItem', () => {
    it('should render correctly when unchecked', () => {
      const node = <DropdownMenuCheckboxItem>Checkbox</DropdownMenuCheckboxItem>;
      const finalNode = honoRender(node);

      expect(finalNode.props.role).toBe('menuitemcheckbox');
      expect(finalNode.props['data-state']).toBe('unchecked');
      expect(finalNode.props['aria-checked']).toBe('false');
    });

    it('should render correctly when checked', () => {
      const node = <DropdownMenuCheckboxItem checked>Checkbox</DropdownMenuCheckboxItem>;
      const finalNode = honoRender(node);

      expect(finalNode.props['data-state']).toBe('checked');
      expect(finalNode.props['aria-checked']).toBe('true');
    });

    it('should match snapshot to verify internal CheckIcon rendering structure', () => {
      const node = (
        <DropdownMenuCheckboxItem checked disabled>
          Checked & Disabled
        </DropdownMenuCheckboxItem>
      );
      expect(honoRender(node)).toMatchSnapshot();
    });
  });

  describe('DropdownMenuRadioItem', () => {
    it('should render correctly when unchecked', () => {
      const node = <DropdownMenuRadioItem>Radio</DropdownMenuRadioItem>;
      const finalNode = honoRender(node);

      expect(finalNode.props.role).toBe('menuitemradio');
      expect(finalNode.props['data-state']).toBe('unchecked');
      expect(finalNode.props['aria-checked']).toBe('false');
    });

    it('should render correctly when checked', () => {
      const node = <DropdownMenuRadioItem checked>Radio</DropdownMenuRadioItem>;
      const finalNode = honoRender(node);

      expect(finalNode.props['data-state']).toBe('checked');
      expect(finalNode.props['aria-checked']).toBe('true');
    });

    it('should match snapshot to verify internal Circle icon rendering structure', () => {
      const node = (
        <DropdownMenuRadioItem checked disabled>
          Checked & Disabled
        </DropdownMenuRadioItem>
      );
      expect(honoRender(node)).toMatchSnapshot();
    });
  });

  describe('Utility Components (Label, Separator, Shortcut)', () => {
    it('should render DropdownMenuLabel correctly', () => {
      const finalNode = honoRender(<DropdownMenuLabel inset>Label</DropdownMenuLabel>);
      expect(finalNode.tag).toBe('div');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-label');
      expect(finalNode.props['data-inset']).toBe('true');
    });

    it('should render DropdownMenuSeparator correctly', () => {
      const finalNode = honoRender(<DropdownMenuSeparator />);
      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.role).toBe('separator');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-separator');
    });

    it('should render DropdownMenuShortcut correctly', () => {
      const finalNode = honoRender(<DropdownMenuShortcut>⌘K</DropdownMenuShortcut>);
      expect(finalNode.tag).toBe('span');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-shortcut');

      const styles = finalNode.props.class || finalNode.props.className;
      expect(styles).toContain('text-muted-foreground');
    });
  });

  describe('Sub-menu Components', () => {
    it('should render DropdownMenuSub with wpm custom element and data-is-sub flag', () => {
      const finalNode = honoRender(<DropdownMenuSub>Sub Items</DropdownMenuSub>);
      expect(finalNode.tag).toBe('wpm-dropdown-menu');
      expect(finalNode.props['data-is-sub']).toBe('true');
    });

    it('should render DropdownMenuSubTrigger correctly', () => {
      const finalNode = honoRender(
        <DropdownMenuSubTrigger inset>Sub Trigger</DropdownMenuSubTrigger>,
      );

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.role).toBe('menuitem');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-sub-trigger');
      expect(finalNode.props['data-inset']).toBe('true');
      expect(finalNode.props['data-state']).toBe('closed');

      expect(finalNode).toMatchSnapshot();
    });

    it('should render DropdownMenuSubContent correctly', () => {
      const finalNode = honoRender(<DropdownMenuSubContent>Sub Content</DropdownMenuSubContent>);

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props['data-slot']).toBe('dropdown-menu-content');
      expect(finalNode.props['data-state']).toBe('closed');

      const styles = finalNode.props.class || finalNode.props.className;
      expect(styles).toContain('origin-(--wpm-dropdown-menu-content-transform-origin)');
    });
  });
});
