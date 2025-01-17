'use client';
import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {AppConfig} from '@/constants/data';

interface AppConfigModalProps {
    appsConfig: AppConfig[],
    isOpen: boolean,
    onClose: () => void,
    onInputChange: (index: number, field: string, value: any) => void,
    onAddQuestion?: (index: number, pageIndex: number) => void
}

export const AppConfigModal: React.FC<AppConfigModalProps> = ({
                                                                  appsConfig,
                                                                  isOpen,
                                                                  onClose,
                                                                  onInputChange,
                                                                  onAddQuestion
                                                              }) => {
    const [isMounted, setIsMounted] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const toggleExpand = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    if (!isMounted) {
        return null;
    }

    return (
        <Modal
            title="App Configurations"
            description="Configure WebOS apps below."
            isOpen={isOpen}
            onClose={onClose}
        >
            <div className="space-y-4 max-h-[70vh] overflow-y-auto"> {/* Added max-height and overflow styles */}
                {appsConfig.map((app, index) => (
                    <div
                        key={app.id}
                        className={`border p-2 rounded-md ${
                            app.disabled ? 'bg-gray-700 opacity-50' : 'bg-gray-800'
                        }`}
                    >
                        <div className="flex justify-between items-center cursor-pointer"
                             onClick={() => toggleExpand(index)}>
                            <div className="text-lg font-bold flex-grow">{app.title}</div>
                            <div className="flex items-center ml-4" onClick={(e) => e.stopPropagation()}>
                                <label htmlFor={`enabled-${index}`} className="mr-2">Enabled</label>
                                <input
                                    id={`enabled-${index}`}
                                    type="checkbox"
                                    checked={!app.disabled}
                                    onChange={(e) => onInputChange(index, 'disabled', !e.target.checked)}
                                />
                            </div>
                        </div>
                        {expandedIndex === index && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div className="flex flex-col">
                                    <label htmlFor={`title-${index}`}>Title</label>
                                    <input
                                        id={`title-${index}`}
                                        value={app.title}
                                        onChange={(e) => onInputChange(index, 'title', e.target.value)}
                                        className="bg-gray-700 text-white"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor={`icon-${index}`}>Icon</label>
                                    <input
                                        id={`icon-${index}`}
                                        value={app.icon}
                                        onChange={(e) => onInputChange(index, 'icon', e.target.value)}
                                        className="bg-gray-700 text-white"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor={`favourite-${index}`} className="flex items-center">
                                        <span className="mr-2">Show on Dock</span>
                                        <input
                                            id={`favourite-${index}`}
                                            type="checkbox"
                                            checked={app.favourite}
                                            onChange={(e) => onInputChange(index, 'favourite', e.target.checked)}
                                        />
                                    </label>
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor={`desktop_shortcut-${index}`} className="flex items-center">
                                        <span className="mr-2">Desktop Shortcut</span>
                                        <input
                                            id={`desktop_shortcut-${index}`}
                                            type="checkbox"
                                            checked={app.desktop_shortcut}
                                            onChange={(e) => onInputChange(index, 'desktop_shortcut', e.target.checked)}
                                        />
                                    </label>
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor={`screen-${index}`}>Display Function</label>
                                    <input
                                        id={`screen-${index}`}
                                        value={app.screen}
                                        onChange={(e) => onInputChange(index, 'screen', e.target.value)}
                                        className="bg-gray-700 text-white"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor={`width-${index}`}>Width(%)</label>
                                    <input
                                        id={`width-${index}`}
                                        type="number"
                                        value={app.width}
                                        onChange={(e) => onInputChange(index, 'width', e.target.value)}
                                        className="bg-gray-700 text-white"
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label htmlFor={`height-${index}`}>Height(%)</label>
                                    <input
                                        id={`height-${index}`}
                                        type="number"
                                        value={app.height}
                                        onChange={(e) => onInputChange(index, 'height', e.target.value)}
                                        className="bg-gray-700 text-white"
                                    />
                                </div>
                                {app.id === 'challenge_prompt' && (
                                    <>
                                        <div className="flex flex-col col-span-2">
                                            <label htmlFor={`description-${index}`}>Description</label>
                                            <textarea
                                                id={`description-${index}`}
                                                value={app.description || ''}
                                                onChange={(e) => onInputChange(index, 'description', e.target.value)}
                                                className="bg-gray-700 text-white"
                                            />
                                        </div>
                                        {app.pages.map((page, pageIndex) => (
                                            <div key={pageIndex} className="col-span-2 border p-2 rounded-md mt-2">
                                                <div className="flex flex-col mb-2">
                                                    <label htmlFor={`instructions-${index}-${pageIndex}`}>Instructions
                                                        (Page {pageIndex + 1})</label>
                                                    <textarea
                                                        id={`instructions-${index}-${pageIndex}`}
                                                        value={page.instructions}
                                                        onChange={(e) => {
                                                            const newPages = [...app.pages];
                                                            newPages[pageIndex].instructions = e.target.value;
                                                            onInputChange(index, 'pages', newPages);
                                                        }}
                                                        className="bg-gray-700 text-white"
                                                    />
                                                </div>
                                                {page.questions.map((question, questionIndex) => (
                                                    <div key={questionIndex} className="border p-2 rounded-md mt-2">
                                                        <div className="flex flex-col mb-2">
                                                            <label
                                                                htmlFor={`question-content-${index}-${pageIndex}-${questionIndex}`}>Question
                                                                (Page {pageIndex + 1},
                                                                Question {questionIndex + 1})</label>
                                                            <input
                                                                id={`question-content-${index}-${pageIndex}-${questionIndex}`}
                                                                value={question.content}
                                                                onChange={(e) => {
                                                                    const newPages = [...app.pages];
                                                                    newPages[pageIndex].questions[questionIndex].content = e.target.value;
                                                                    onInputChange(index, 'pages', newPages);
                                                                }}
                                                                className="bg-gray-700 text-white"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col mb-2">
                                                            <label
                                                                htmlFor={`question-points-${index}-${pageIndex}-${questionIndex}`}>Points</label>
                                                            <input
                                                                id={`question-points-${index}-${pageIndex}-${questionIndex}`}
                                                                type="number"
                                                                value={question.points}
                                                                onChange={(e) => {
                                                                    const newPages = [...app.pages];
                                                                    newPages[pageIndex].questions[questionIndex].points = parseInt(e.target.value, 10);
                                                                    onInputChange(index, 'pages', newPages);
                                                                }}
                                                                className="bg-gray-700 text-white"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex w-full items-center justify-end space-x-2 pt-6">
                <Button variant="outline" onClick={onClose}>
                    Close
                </Button>
                <Button variant="default" onClick={onClose}>
                    Apply
                </Button>
            </div>
        </Modal>
    );
};
