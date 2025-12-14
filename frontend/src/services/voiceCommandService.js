/**
 * Voice Command Service
 * Handles parsing and executing voice commands
 */

class VoiceCommandService {
  constructor() {
    this.commands = {
      // Navigation commands
      'go to': this.handleNavigation,
      'open': this.handleNavigation,
      'navigate to': this.handleNavigation,
      'show': this.handleNavigation,
      
      // Search commands
      'search': this.handleSearch,
      'find': this.handleSearch,
      'look for': this.handleSearch,
      
      // Product commands
      'add product': this.handleAddProduct,
      'add item': this.handleAddProduct,
      
      // Customer commands
      'add customer': this.handleAddCustomer,
      'new customer': this.handleAddCustomer,
      
      // Common actions
      'save': this.handleSave,
      'delete': this.handleDelete,
      'cancel': this.handleCancel,
      'clear': this.handleClear,
      'reset': this.handleReset,
      'print': this.handlePrint,
      'export': this.handleExport,
      
      // Numbers
      'quantity': this.handleQuantity,
      'amount': this.handleAmount,
      'price': this.handlePrice,
    };

    this.navigationMap = {
      'dashboard': '/dashboard',
      'home': '/dashboard',
      'sales': '/sales',
      'purchase': '/purchase',
      'products': '/products',
      'customers': '/customers',
      'suppliers': '/suppliers',
      'inventory': '/inventory',
      'reports': '/reports',
      'settings': '/settings',
      'orders': '/orders',
      'purchase orders': '/purchase-orders',
      'sales orders': '/sales-orders',
      'cash receipts': '/cash-receipts',
      'cash payments': '/cash-payments',
    };
  }

  /**
   * Clean voice input - remove trailing punctuation
   * @param {string} text - Raw voice input
   * @returns {string} Cleaned text
   */
  cleanInput(text) {
    if (!text) return '';
    // Remove trailing punctuation (periods, commas, question marks, exclamation marks, semicolons, colons)
    let cleaned = text.trim().replace(/[.,!?;:]+$/, '');
    // Remove extra whitespace
    cleaned = cleaned.trim();
    return cleaned;
  }

  /**
   * Parse voice command and extract intent
   * @param {string} transcript - Voice transcript
   * @returns {Object} Parsed command with intent and parameters
   */
  parseCommand(transcript) {
    if (!transcript) return null;

    // Clean the transcript first
    const cleanedTranscript = this.cleanInput(transcript);
    const lowerTranscript = cleanedTranscript.toLowerCase().trim();
    
    // Check for navigation commands
    for (const [keyword, handler] of Object.entries(this.commands)) {
      if (lowerTranscript.startsWith(keyword)) {
        const rest = lowerTranscript.substring(keyword.length).trim();
        return {
          intent: keyword,
          handler,
          parameters: rest,
          original: transcript
        };
      }
    }

    // Default: treat as search query (use cleaned transcript)
    return {
      intent: 'search',
      handler: this.handleSearch,
      parameters: cleanedTranscript,
      original: transcript
    };
  }

  /**
   * Handle navigation commands
   * @param {string} parameters - Command parameters
   * @returns {Object} Navigation action
   */
  handleNavigation(parameters) {
    const lowerParams = parameters.toLowerCase().trim();
    
    // Find matching navigation route
    for (const [keyword, route] of Object.entries(this.navigationMap)) {
      if (lowerParams.includes(keyword)) {
        return {
          type: 'navigation',
          route,
          message: `Navigating to ${keyword}...`
        };
      }
    }

    return {
      type: 'navigation',
      route: null,
      message: `Could not find page: ${parameters}`
    };
  }

  /**
   * Handle search commands
   * @param {string} parameters - Search query
   * @returns {Object} Search action
   */
  handleSearch(parameters) {
    return {
      type: 'search',
      query: parameters,
      message: `Searching for: ${parameters}`
    };
  }

  /**
   * Handle add product commands
   * @param {string} parameters - Product name
   * @returns {Object} Add product action
   */
  handleAddProduct(parameters) {
    return {
      type: 'add_product',
      productName: parameters,
      message: `Adding product: ${parameters}`
    };
  }

  /**
   * Handle add customer commands
   * @param {string} parameters - Customer name
   * @returns {Object} Add customer action
   */
  handleAddCustomer(parameters) {
    return {
      type: 'add_customer',
      customerName: parameters,
      message: `Adding customer: ${parameters}`
    };
  }

  /**
   * Handle save command
   * @returns {Object} Save action
   */
  handleSave() {
    return {
      type: 'action',
      action: 'save',
      message: 'Saving...'
    };
  }

  /**
   * Handle delete command
   * @returns {Object} Delete action
   */
  handleDelete() {
    return {
      type: 'action',
      action: 'delete',
      message: 'Deleting...'
    };
  }

  /**
   * Handle cancel command
   * @returns {Object} Cancel action
   */
  handleCancel() {
    return {
      type: 'action',
      action: 'cancel',
      message: 'Cancelling...'
    };
  }

  /**
   * Handle clear command
   * @returns {Object} Clear action
   */
  handleClear() {
    return {
      type: 'action',
      action: 'clear',
      message: 'Clearing...'
    };
  }

  /**
   * Handle reset command
   * @returns {Object} Reset action
   */
  handleReset() {
    return {
      type: 'action',
      action: 'reset',
      message: 'Resetting...'
    };
  }

  /**
   * Handle print command
   * @returns {Object} Print action
   */
  handlePrint() {
    return {
      type: 'action',
      action: 'print',
      message: 'Printing...'
    };
  }

  /**
   * Handle export command
   * @returns {Object} Export action
   */
  handleExport() {
    return {
      type: 'action',
      action: 'export',
      message: 'Exporting...'
    };
  }

  /**
   * Handle quantity command
   * @param {string} parameters - Quantity value
   * @returns {Object} Quantity action
   */
  handleQuantity(parameters) {
    const quantity = this.extractNumber(parameters);
    return {
      type: 'set_quantity',
      value: quantity,
      message: `Setting quantity to ${quantity}`
    };
  }

  /**
   * Handle amount command
   * @param {string} parameters - Amount value
   * @returns {Object} Amount action
   */
  handleAmount(parameters) {
    const amount = this.extractNumber(parameters);
    return {
      type: 'set_amount',
      value: amount,
      message: `Setting amount to ${amount}`
    };
  }

  /**
   * Handle price command
   * @param {string} parameters - Price value
   * @returns {Object} Price action
   */
  handlePrice(parameters) {
    const price = this.extractNumber(parameters);
    return {
      type: 'set_price',
      value: price,
      message: `Setting price to ${price}`
    };
  }

  /**
   * Extract number from text
   * @param {string} text - Text containing number
   * @returns {number} Extracted number
   */
  extractNumber(text) {
    // Remove common words and extract number
    const cleaned = text.replace(/[^\d.]/g, '');
    const number = parseFloat(cleaned);
    return isNaN(number) ? 0 : number;
  }

  /**
   * Execute voice command
   * @param {string} transcript - Voice transcript
   * @param {Object} context - Current context (page, state, etc.)
   * @returns {Object} Command result
   */
  execute(transcript, context = {}) {
    const command = this.parseCommand(transcript);
    
    if (!command) {
      return {
        success: false,
        message: 'Could not parse command'
      };
    }

    try {
      const result = command.handler.call(this, command.parameters);
      return {
        success: true,
        command: command.intent,
        result,
        original: transcript
      };
    } catch (error) {
      console.error('Error executing voice command:', error);
      return {
        success: false,
        message: 'Error executing command',
        error: error.message
      };
    }
  }
}

// Export singleton instance
export default new VoiceCommandService();

