import * as ts from 'typescript';
import * as Lint from 'tslint';

export class Rule extends Lint.Rules.AbstractRule {
    public static metadata: Lint.IRuleMetadata = {
        ruleName: 'no-fs',
        description: 'Bans the use of fs.',
        rationale:
            'fs.readFileSync will not work correctly because we will be adding asar verification' +
            'and it will require every filename.ext being read to need a filename.ext.ofds file associated with it.',
        optionsDescription: '',
        options: {
            type: 'array',
            items: { type: 'string' }
        },
        optionExamples: ['readFileSync'],
        type: 'functionality',
        typescriptOnly: false
    };

    public static FAILURE_STRING = 'Use original-fs instead of fs';

    public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
        return this.applyWithFunction(sourceFile, walk);
    }
}

function walk(ctx: Lint.WalkContext<void>) {
    // Recursively walk the AST starting with root node, `ctx.sourceFile`.
    // Call the function `cb` (defined below) for each child.
    return ts.forEachChild(ctx.sourceFile, cb);

    function cb(node: ts.Node): void {
        if (node.kind === ts.SyntaxKind.CallExpression) {
            const callChild = node.getChildAt(0);
            if (callChild.kind === ts.SyntaxKind.PropertyAccessExpression) {
                const propertyAccessFirstIdentifier = callChild.getChildAt(0);
                if (propertyAccessFirstIdentifier.getText() === 'fs') {
                    return ctx.addFailureAtNode(propertyAccessFirstIdentifier, Rule.FAILURE_STRING);
                }
            }
        }
        return ts.forEachChild(node, cb);
    }
}
