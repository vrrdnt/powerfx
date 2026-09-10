import type { Mode } from './core/types';
export const modeNames: Record<Mode, string> = {
  powerapps: 'Power Apps',
  yaml: 'Power Apps YAML',
  cloud: 'Power Automate Cloud',
  desktop: 'Power Automate Desktop',
};
export const examples: { name: string; mode: Mode; source: string }[] = [
  {
    name: 'An order, neatly arranged',
    mode: 'powerapps',
    source:
      '// Calculate the order and apply a discount\nWith({subtotal:Sum(colCart,UnitPrice*Quantity),discount:If(CountRows(colCart)>=5,0.1,0)},With({total:subtotal*(1-discount)},If(total>0,Patch(Orders,Defaults(Orders),{Title:txtOrderName.Text,Customer:ddCustomer.Selected,Subtotal:subtotal,Discount:discount,Total:total,Status:"Draft"});Notify("Order saved",NotificationType.Success),Notify("Add an item to get started",NotificationType.Warning))))',
  },
  {
    name: 'Named formulas & functions',
    mode: 'powerapps',
    source:
      '// Shared calculations in App.Formulas\nTaxRate = 0.08;\nSubtotal = Sum(colCart,UnitPrice*Quantity);\nOrderTotal = Subtotal*(1+TaxRate);\n\nPriceWithTax(amount: Number): Number = Round(amount*(1+TaxRate),2);\nCustomerType := Type({Name:Text,Email:Text});',
  },
  {
    name: 'A control and its properties',
    mode: 'yaml',
    source:
      '- SaveButton:\n    Control: Classic/Button@2.2.0\n    Properties:\n      Text: ="Save order"\n      Width: =160\n      Height: =40\n      OnSelect: |-\n        =If(IsBlank(txtOrderName.Text),Notify("Enter an order name",NotificationType.Warning),Patch(Orders,Defaults(Orders),{Title:txtOrderName.Text,Total:Sum(colCart,UnitPrice*Quantity)});Notify("Saved",NotificationType.Success))\n',
  },
  {
    name: 'A cloud-flow expression',
    mode: 'cloud',
    source:
      "if(and(equals(triggerBody()?['Status'],'Approved'),greater(float(coalesce(triggerBody()?['Amount'],'0')),1000)),concat('Priority order: ',triggerBody()?['Title'],' — ',formatNumber(float(triggerBody()?['Amount']),'N2')),concat('Standard order: ',coalesce(triggerBody()?['Title'],'Untitled')))",
  },
  {
    name: 'Cloud email interpolation',
    mode: 'cloud',
    source:
      "Hello @{coalesce(triggerBody()?['CustomerName'],'there')},\n\nOrder @{triggerBody()?['OrderNumber']} is ready.\nTotal: @{formatNumber(mul(float(variables('subtotal')),1.08),'N2')}\n\nThank you!",
  },
  {
    name: 'A desktop-flow formula',
    mode: 'desktop',
    source:
      '=If(IsBlank(CustomerName),"Hello there",Concatenate("Hello ",CustomerName," — your total is ",Text(Sum(OrderLines,Quantity*UnitPrice),"0.00")))',
  },
  {
    name: 'Desktop text interpolation',
    mode: 'desktop',
    source:
      'Invoice for ${CustomerName}\nTotal: ${Text(Sum(OrderLines,Quantity*UnitPrice),"0.00")}\nItems: ${CountRows(OrderLines)}',
  },
];
