import { cva } from "class-variance-authority";
import { OTPInput, OTPInputContext as OTPInputContextBase } from "input-otp";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	type TargetAndTransition,
} from "motion/react";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

type InputOTPSlotSize = "sm" | "md" | "lg";
type InputOTPVariant = "bordered" | "underlined";

type InputOTPContextType = {
	variant?: InputOTPVariant;
	slotSize?: InputOTPSlotSize;
};

const InputOTPContext = createContext<InputOTPContextType>({
	slotSize: "md",
	variant: "bordered",
});

export const useInputOTPContext = () => {
	const context = useContext(InputOTPContext);
	if (!context) {
		throw new Error(
			"useInputOTPContext must be used within a InputOTPProvider",
		);
	}
	return context;
};

const InputOTPProvider = ({
	children,
	variant = "bordered",
	slotSize = "md",
}: InputOTPContextType & { children: React.ReactNode }) => {
	return (
		<InputOTPContext.Provider value={{ slotSize, variant }}>
			{children}
		</InputOTPContext.Provider>
	);
};

type InputOTPProps = React.ComponentProps<typeof OTPInput> & {
	variant?: InputOTPVariant;
	slotSize?: InputOTPSlotSize;
};

function InputOTP({
	containerClassName,
	className,
	variant = "bordered",
	slotSize = "md",
	...props
}: InputOTPProps) {
	return (
		<InputOTPProvider slotSize={slotSize} variant={variant}>
			<OTPInput
				className={cn("disabled:cursor-not-allowed", className)}
				containerClassName={cn(
					"flex items-center gap-2 has-disabled:opacity-50",
					containerClassName,
				)}
				data-slot="input-otp"
				data-variant={variant}
				{...props}
			/>
		</InputOTPProvider>
	);
}

type InputOTPGroupProps = React.ComponentProps<"div">;

function InputOTPGroup({ className, ...props }: InputOTPGroupProps) {
	return (
		<div
			className={cn("flex items-center gap-1", className)}
			data-slot="input-otp-group"
			{...props}
		/>
	);
}

type InputOTPAnimatedNumberProps = {
	value: string | null;
};

function InputOTPAnimatedNumber({ value }: InputOTPAnimatedNumberProps) {
	const animationProps: {
		[key: string]: TargetAndTransition;
	} = {
		animate: {
			opacity: 1,
			transition: {
				duration: 0.2,
				ease: [0.25, 0.1, 0.25, 1],
				type: "tween",
			},
			y: 0,
		},
		exit: {
			opacity: 0,
			transition: {
				duration: 0.15,
				ease: [0.25, 0.1, 0.25, 1],
				type: "tween",
			},
			y: 10,
		},
		initial: { opacity: 0, y: 10 },
	};

	return (
		<div className="relative flex size-[inherit] items-center justify-center overflow-hidden">
			<AnimatePresence mode="wait">
				{value && (
					<motion.span
						animate={animationProps.animate}
						data-slot="input-otp-animated-number"
						exit={animationProps.exit}
						initial={animationProps.initial}
						key={value}
					>
						{value}
					</motion.span>
				)}
			</AnimatePresence>
		</div>
	);
}

const inputOtpSlotVariants = cva(
	"relative font-semibold flex items-center justify-center",
	{
		defaultVariants: {
			slotSize: "md",
			variant: "bordered",
		},
		variants: {
			slotSize: {
				lg: "h-12 min-h-12 w-12 min-w-12 text-lg",
				md: "h-10 min-h-10 w-10 min-w-10 text-base",
				sm: "h-8 min-h-8 w-8 min-w-8 text-sm",
			},
			variant: {
				bordered:
					"rounded-[10px] border border-border bg-background dark:bg-input/32",
				underlined:
					"rounded-none border-b border-border bg-background dark:bg-input/32",
			},
		},
	},
);

const inputOtpSlotIndicatorVariants = cva("absolute inset-0 z-10", {
	defaultVariants: {
		variant: "bordered",
	},
	variants: {
		variant: {
			bordered: "rounded-[inherit] ring-2 ring-primary/70 outline-none",
			underlined: "border-b border-primary",
		},
	},
});

type InputOTPSlotProps = React.ComponentProps<typeof motion.div> & {
	index: number;
};

function InputOTPSlot({ index, className, ...props }: InputOTPSlotProps) {
	const originalContext = useContext(OTPInputContextBase);
	const { variant, slotSize } = useInputOTPContext();

	const { char, hasFakeCaret, isActive } = originalContext?.slots[index] ?? {};

	const activeSlots =
		originalContext?.slots.filter((slot) => slot.isActive) ?? [];
	const isMultiSelect = activeSlots.length > 1;

	return (
		<MotionConfig reducedMotion="user">
			<motion.div
				className={cn(inputOtpSlotVariants({ className, slotSize, variant }))}
				data-slot="input-otp-slot"
				{...props}
			>
				<InputOTPAnimatedNumber value={char} />

				{hasFakeCaret && <FakeCaret />}

				<AnimatePresence mode="wait">
					{isActive && (
						<motion.div
							className={cn(inputOtpSlotIndicatorVariants({ variant }))}
							key={`${isActive}-${isMultiSelect}`}
							layoutId={isMultiSelect ? `indicator-${index}` : "indicator"}
							transition={{
								duration: 0.38,
								ease: [0.23, 1, 0.32, 1],
								type: "tween",
							}}
						/>
					)}
				</AnimatePresence>
			</motion.div>
		</MotionConfig>
	);
}

type InputOTPSeparatorProps = React.ComponentProps<"div">;

function InputOTPSeparator({ className, ...props }: InputOTPSeparatorProps) {
	return (
		<div
			aria-hidden
			className={cn("h-0.5 w-2 rounded-full bg-border", className)}
			data-slot="input-otp-separator"
			{...props}
		/>
	);
}

function FakeCaret() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			<div className="h-4.5 w-px bg-primary motion-safe:animate-caret-blink motion-safe:duration-1000" />
		</div>
	);
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
